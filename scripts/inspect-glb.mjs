#!/usr/bin/env node
/** Offline GLB inspection. Uses only Node and the project's existing Three dependency.
 * Usage: node scripts/inspect-glb.mjs path/to/model.glb [...more.glb]
 * Prints JSON reports and exits nonzero for structural failures. This is not a
 * substitute for the Khronos validator or inspection in the actual renderer.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const COMPONENTS = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const ELEMENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const finite = values => values.every(Number.isFinite);
const integer = value => Number.isInteger(value) && value >= 0;

export function inspectGlb(bytes, source = '<buffer>') {
  const errors = [], warnings = [];
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  require(bytes.length >= 20, 'File is too short for a GLB header and JSON chunk');
  require(bytes.readUInt32LE(0) === 0x46546c67, 'Invalid GLB magic');
  require(bytes.readUInt32LE(4) === 2, 'Only GLB version 2 is supported');
  require(bytes.readUInt32LE(8) === bytes.length, 'GLB header length does not match file');
  let json, binary, offset = 12, chunkCount = 0;
  while (offset < bytes.length) {
    require(offset + 8 <= bytes.length, 'Truncated chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    require(length % 4 === 0, 'Chunk length is not four-byte aligned');
    require(offset + 8 + length <= bytes.length, 'Chunk exceeds file bounds');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (chunkCount === 0) require(type === 0x4e4f534a, 'First chunk must be JSON');
    if (type === 0x4e4f534a) {
      require(json === undefined, 'Duplicate JSON chunk');
      json = JSON.parse(chunk.toString('utf8').trim());
    } else if (type === 0x004e4942) {
      require(binary === undefined, 'Duplicate BIN chunk'); binary = chunk;
    } else warnings.push(`Unknown chunk type 0x${type.toString(16)}`);
    offset += 8 + length; chunkCount++;
  }
  require(json?.asset?.version === '2.0', 'Missing glTF 2.0 asset metadata');
  const buffers = json.buffers ?? [], views = json.bufferViews ?? [], accessors = json.accessors ?? [];
  const externalResources = [], dataUriResources = [];
  const decodeUri = (uri, label) => {
    if (!uri?.startsWith('data:')) { externalResources.push({ resource: label, uri }); return null; }
    dataUriResources.push(label);
    const comma = uri.indexOf(','); require(comma !== -1, `Malformed data URI: ${label}`);
    return uri.slice(0, comma).endsWith(';base64') ? Buffer.from(uri.slice(comma + 1), 'base64') : Buffer.from(decodeURIComponent(uri.slice(comma + 1)));
  };
  const bufferData = buffers.map((b, i) => {
    require(integer(b.byteLength), `Invalid byteLength on buffer ${i}`);
    const data = b.uri ? decodeUri(b.uri, `buffer ${i}`) : (i === 0 ? binary : null);
    if (data) require(data.length >= b.byteLength, `Buffer ${i} is shorter than declared`);
    else if (!b.uri) errors.push(`Buffer ${i} has no embedded data`);
    return data;
  });
  const viewData = views.map((v, i) => {
    require(integer(v.buffer) && v.buffer < buffers.length, `bufferView ${i} references missing buffer`);
    require(integer(v.byteLength) && integer(v.byteOffset ?? 0), `Invalid bufferView ${i} bounds`);
    require((v.byteOffset ?? 0) + v.byteLength <= buffers[v.buffer].byteLength, `bufferView ${i} exceeds buffer`);
    if (v.byteStride !== undefined) require(integer(v.byteStride) && v.byteStride >= 4 && v.byteStride <= 252 && v.byteStride % 4 === 0, `Invalid stride on bufferView ${i}`);
    const data = bufferData[v.buffer];
    return data ? data.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength) : null;
  });
  const accessorData = accessors.map((a, i) => {
    require(COMPONENTS[a.componentType] && ELEMENTS[a.type], `Invalid accessor ${i} type`);
    require(integer(a.count) && a.count > 0 && integer(a.byteOffset ?? 0), `Invalid accessor ${i} count/offset`);
    const [size, method] = COMPONENTS[a.componentType], elements = ELEMENTS[a.type];
    // glTF pads each matrix column to four bytes for 8/16-bit matrices.
    const matrixSide = a.type.startsWith('MAT') ? Math.sqrt(elements) : 0;
    const columnBytes = matrixSide ? Math.ceil(matrixSide * size / 4) * 4 : 0;
    const elementBytes = matrixSide ? columnBytes * matrixSide : size * elements;
    const componentOffset = c => matrixSide ? Math.floor(c / matrixSide) * columnBytes + (c % matrixSide) * size : c * size;
    const read = (data, start, stride, count) => {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      return (row, col) => dv[method](start + row * stride + componentOffset(col), true);
    };
    let value = () => 0;
    if (a.bufferView !== undefined) {
      require(integer(a.bufferView) && a.bufferView < views.length, `Accessor ${i} references missing bufferView`);
      const v = views[a.bufferView], start = a.byteOffset ?? 0, stride = v.byteStride ?? elementBytes;
      require(stride >= elementBytes && stride % size === 0, `Accessor ${i} has incompatible stride`);
      require(start % size === 0 && ((v.byteOffset ?? 0) + start) % size === 0, `Accessor ${i} is misaligned`);
      require(start + (a.count - 1) * stride + elementBytes <= v.byteLength, `Accessor ${i} exceeds bufferView`);
      if (viewData[a.bufferView]) value = read(viewData[a.bufferView], start, stride, a.count);
    } else require(a.sparse, `Accessor ${i} has neither data nor sparse values`);
    if (a.sparse) {
      const s = a.sparse, sparseValues = new Map();
      require(integer(s.count) && s.count > 0 && s.count <= a.count, `Invalid sparse count on accessor ${i}`);
      require([5121, 5123, 5125].includes(s.indices.componentType), `Invalid sparse index type on accessor ${i}`);
      const indices = viewData[s.indices.bufferView], values = viewData[s.values.bufferView];
      require(indices && values, `Missing embedded sparse data on accessor ${i}`);
      const [indexBytes, indexMethod] = COMPONENTS[s.indices.componentType];
      const indexOffset = s.indices.byteOffset ?? 0, valuesOffset = s.values.byteOffset ?? 0;
      require(integer(indexOffset) && integer(valuesOffset), `Invalid sparse offsets on accessor ${i}`);
      require(indexOffset + s.count * indexBytes <= indices.length && valuesOffset + s.count * elementBytes <= values.length, `Sparse accessor ${i} exceeds bufferView`);
      const dv = new DataView(indices.buffer, indices.byteOffset, indices.byteLength), sparseRead = read(values, valuesOffset, elementBytes, s.count);
      let previous = -1;
      for (let n = 0; n < s.count; n++) {
        const row = dv[indexMethod](indexOffset + n * indexBytes, true);
        require(row > previous && row < a.count, `Sparse accessor ${i} indices are unsorted/out of range`);
        sparseValues.set(row, Array.from({ length: elements }, (_, col) => sparseRead(n, col))); previous = row;
      }
      const base = value; value = (row, col) => sparseValues.get(row)?.[col] ?? base(row, col);
    }
    return { ...a, value };
  });
  const meshes = json.meshes ?? [], nodes = json.nodes ?? [], materials = json.materials ?? [];
  let primitives = 0, uniqueTriangles = 0, sceneTriangles = 0;
  const meshStats = meshes.map((m, mi) => {
    const bounds = new Box3(), positions = []; let triangles = 0;
    require(m.primitives?.length > 0, `Mesh ${mi} has no primitives`);
    for (const [pi, p] of m.primitives.entries()) {
      primitives++;
      const position = accessorData[p.attributes?.POSITION];
      require(position?.type === 'VEC3', `Mesh ${mi} primitive ${pi} has no VEC3 POSITION`);
      positions.push(position);
      require(position.componentType === 5126 || json.extensionsUsed?.includes('KHR_mesh_quantization'), `Mesh ${mi} POSITION needs float or KHR_mesh_quantization`);
      if (p.material !== undefined) require(integer(p.material) && p.material < materials.length, `Mesh ${mi} has invalid material`);
      for (const [attribute, index] of Object.entries(p.attributes)) {
        require(accessorData[index]?.count === position.count, `Mesh ${mi} ${attribute} has incompatible count/reference`);
      }
      const local = new Box3();
      for (let n = 0; n < position.count; n++) {
        const xyz = [0, 1, 2].map(c => position.value(n, c));
        require(finite(xyz), `Mesh ${mi} has non-finite POSITION`); local.expandByPoint(new Vector3(...xyz));
      }
      bounds.union(local);
      if (!position.min || !position.max) errors.push(`Mesh ${mi} POSITION lacks declared bounds`);
      else {
        for (const key of ['min', 'max']) {
          require(position[key].length === 3 && finite(position[key]), `Mesh ${mi} has invalid POSITION ${key}`);
          const actual = local[key].toArray();
          if (actual.some((v, c) => Math.abs(v - position[key][c]) > Math.max(1e-5, Math.abs(v) * 1e-5))) errors.push(`Mesh ${mi} POSITION ${key} differs from actual vertices`);
        }
      }
      let count = position.count;
      if (p.indices !== undefined) {
        const index = accessorData[p.indices];
        require(index?.type === 'SCALAR' && [5121, 5123, 5125].includes(index.componentType), `Mesh ${mi} has invalid index accessor`);
        count = index.count;
        for (let n = 0; n < count; n++) require(index.value(n, 0) < position.count, `Mesh ${mi} index ${n} exceeds vertex count`);
      }
      const mode = p.mode ?? 4; require(integer(mode) && mode <= 6, `Mesh ${mi} has invalid primitive mode`);
      if (mode === 4) { require(count % 3 === 0, `Mesh ${mi} triangle index/vertex count is not divisible by three`); triangles += count / 3; }
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      else warnings.push(`Mesh ${mi} primitive ${pi} uses non-triangle mode ${mode}`);
    }
    uniqueTriangles += triangles; return { bounds, triangles, positions };
  });
  const sceneIndex = json.scene ?? 0, scene = json.scenes?.[sceneIndex];
  require(scene && Array.isArray(scene.nodes), 'Missing default scene');
  const sceneBounds = new Box3(), visited = new Set(); let meshInstances = 0, renderedPrimitives = 0;
  function visit(index, parent, ancestors) {
    require(integer(index) && index < nodes.length, `Scene references missing node ${index}`);
    require(!ancestors.has(index), `Scene graph cycle at node ${index}`);
    require(!visited.has(index), `Node ${index} appears under more than one parent`); visited.add(index);
    const n = nodes[index], next = new Set(ancestors).add(index), transform = new Matrix4();
    if (n.matrix) {
      require(n.matrix.length === 16 && finite(n.matrix), `Node ${index} has invalid matrix`);
      require(!n.translation && !n.rotation && !n.scale, `Node ${index} mixes matrix and TRS`); transform.fromArray(n.matrix);
    } else {
      const t = n.translation ?? [0, 0, 0], r = n.rotation ?? [0, 0, 0, 1], s = n.scale ?? [1, 1, 1];
      require(t.length === 3 && r.length === 4 && s.length === 3 && finite([...t, ...r, ...s]), `Node ${index} has invalid TRS`);
      require(Math.abs(Math.hypot(...r) - 1) < 1e-4, `Node ${index} quaternion is not normalized`);
      transform.compose(new Vector3(...t), new Quaternion(...r), new Vector3(...s));
    }
    const world = parent.clone().multiply(transform);
    if (n.mesh !== undefined) {
      require(integer(n.mesh) && n.mesh < meshStats.length, `Node ${index} references missing mesh`);
      // Transform actual positions: transformed local AABBs overestimate the
      // extents of rotated, material-merged meshes (especially cabin floors).
      const vertex = new Vector3();
      for (const position of meshStats[n.mesh].positions) for (let row = 0; row < position.count; row++) {
        vertex.set(position.value(row, 0), position.value(row, 1), position.value(row, 2)).applyMatrix4(world);
        sceneBounds.expandByPoint(vertex);
      }
      meshInstances++;
      sceneTriangles += meshStats[n.mesh].triangles; renderedPrimitives += meshes[n.mesh].primitives.length;
    }
    for (const child of n.children ?? []) visit(child, world, next);
  }
  for (const n of scene.nodes) visit(n, new Matrix4(), new Set());
  require(!sceneBounds.isEmpty() && finite([...sceneBounds.min.toArray(), ...sceneBounds.max.toArray()]), 'Scene bounds are empty or non-finite');
  const dimensions = sceneBounds.getSize(new Vector3()).toArray();
  // glTF uses meters. Extreme extents warrant manual authoring-unit inspection,
  // but a generic inspector must not reject valid tiny props or large worlds.
  if (Math.max(...dimensions) > 1000 || Math.max(...dimensions) < 0.001) warnings.push('Scene extent is unusual for meter-scale game assets; verify authoring units');
  if (dimensions.some(d => d < 1e-7)) warnings.push('Scene has a near-zero dimension; inspect planar geometry/normals');
  if (json.skins?.length || json.animations?.length || meshes.some(m => m.primitives.some(p => p.targets))) warnings.push('Bounds represent the base mesh pose; skinning/morph animation is not evaluated');
  const images = (json.images ?? []).map((img, i) => {
    require(img.uri !== undefined || img.bufferView !== undefined, `Image ${i} has no data`);
    require(!(img.uri !== undefined && img.bufferView !== undefined), `Image ${i} has both URI and bufferView`);
    if (img.bufferView !== undefined) require(integer(img.bufferView) && img.bufferView < views.length, `Image ${i} references missing bufferView`);
    const data = img.uri ? decodeUri(img.uri, `image ${i}`) : viewData[img.bufferView];
    const result = { name: img.name ?? `image_${i}`, mimeType: img.mimeType, bytes: data?.length ?? null, embedded: Boolean(data) };
    if (data?.length >= 24 && data.readUInt32BE(0) === 0x89504e47 && data.toString('ascii', 12, 16) === 'IHDR') result.dimensions = [data.readUInt32BE(16), data.readUInt32BE(20)];
    return result;
  });
  for (const [i, t] of (json.textures ?? []).entries()) {
    const sourceIndex = t.source ?? t.extensions?.KHR_texture_basisu?.source ?? t.extensions?.EXT_texture_webp?.source;
    require(integer(sourceIndex) && sourceIndex < images.length, `Texture ${i} references missing image`);
  }
  function checkTextureInfo(object, materialIndex) {
    for (const [key, value] of Object.entries(object ?? {})) {
      if (!value || typeof value !== 'object') continue;
      if (key.endsWith('Texture')) require(integer(value.index) && value.index < (json.textures?.length ?? 0), `Material ${materialIndex} ${key} references missing texture`);
      else checkTextureInfo(value, materialIndex);
    }
  }
  materials.forEach(checkTextureInfo);
  if (externalResources.length) errors.push('Asset contains external resources; this game requires self-contained GLBs');
  const requiredExtensions = json.extensionsRequired ?? [];
  if (requiredExtensions.some(e => /draco|meshopt|basisu/i.test(e))) warnings.push('Asset requires compressed-data decoder support; confirm runtime loader configuration');
  if ((json.extensionsUsed ?? []).includes('EXT_mesh_gpu_instancing')) warnings.push('GPU instance transforms are not evaluated in this report');
  return { source, valid: errors.length === 0, bytes: bytes.length, generator: json.asset.generator, nodes: nodes.length,
    meshes: meshes.length, primitives, meshInstances, renderedPrimitives, uniqueTriangles, sceneTriangles,
    materials: materials.length, materialNames: materials.map(m => m.name ?? ''), textures: json.textures?.length ?? 0, images,
    requiredExtensions, usedExtensions: json.extensionsUsed ?? [], externalResources, dataUriResources,
    bounds: { min: sceneBounds.min.toArray(), max: sceneBounds.max.toArray(), dimensions, units: 'meters (glTF convention)' }, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const paths = process.argv.slice(2);
  if (!paths.length) { console.error('Usage: node scripts/inspect-glb.mjs path/to/model.glb [...more.glb]'); process.exitCode = 2; }
  for (const path of paths) {
    try {
      const report = inspectGlb(await readFile(path), path); console.log(JSON.stringify(report, null, 2));
      if (!report.valid) process.exitCode = 1;
    } catch (error) { console.log(JSON.stringify({ source: path, valid: false, errors: [error.message] }, null, 2)); process.exitCode = 1; }
  }
}
