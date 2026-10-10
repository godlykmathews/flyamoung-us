import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, Mesh, Vector3 } from 'three';
import { CloudVolumes } from './CloudVolumes';

/** A world outside the moving aircraft. Presentation coordinates deliberately
 * remain separate from the server's metre-scale cabin and collision world. */
export function FlightEnvironment({ moving = true }: { moving?: boolean }) {
 return <>
  <FlightAtmosphere />
  <EarthBelow moving={moving} />
  <Suspense fallback={null}><CloudVolumes moving={moving} /></Suspense>
 </>;
}

export function FlightAtmosphere() {
 const ref = useRef<Mesh>(null);
 const uniforms = useMemo(() => ({
  zenith: { value: new Color('#6ca5d1') },
  horizon: { value: new Color('#d4e2e9') },
  below: { value: new Color('#afc9d7') },
  sunDirection: { value: new Vector3(-85, 100, -90).normalize() },
 }), []);
 useFrame(({ camera }) => ref.current?.position.copy(camera.position));
 return <mesh ref={ref} renderOrder={-20}>
  <sphereGeometry args={[4200, 24, 16]} />
  <shaderMaterial side={BackSide} depthWrite={false} fog={false} uniforms={uniforms}
   vertexShader={`varying vec3 direction;
    void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
   fragmentShader={`uniform vec3 zenith;uniform vec3 horizon;uniform vec3 below;uniform vec3 sunDirection;varying vec3 direction;
    void main(){
     vec3 ray=normalize(direction);
     vec3 sky=mix(horizon,zenith,pow(max(ray.y,0.0),.55));
     sky=mix(sky,below,1.0-smoothstep(-.55,0.0,ray.y));
     sky+=vec3(.12,.095,.055)*pow(max(dot(ray,sunDirection),0.0),18.0);
     gl_FragColor=vec4(sky,1.0);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`} />
 </mesh>;
}

/** Analytic terrain has no downloaded satellite imagery. Broad coastlines,
 * mountain ridges, farms and shallow water survive distant atmospheric haze. */
function EarthBelow({ moving }: { moving: boolean }) {
 const uniforms = useMemo(() => ({ travel: { value: 0 } }), []);
 useFrame((_, delta) => { if (moving) uniforms.travel.value += Math.min(delta, .1) * 7; });
 return <mesh position={[0, -155, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-10}>
  <planeGeometry args={[8000, 8000]} />
  <shaderMaterial uniforms={uniforms} fog={false}
   vertexShader={`varying vec3 world;
    void main(){world=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}`}
   fragmentShader={`uniform float travel;varying vec3 world;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
    float fbm(vec2 p){return noise(p)*.54+noise(p*2.03)*.27+noise(p*4.09)*.13+noise(p*8.17)*.06;}
    float coast(vec2 p){return fbm(p*.0035+vec2(18,41))-.49+sin(p.x*.0013+p.y*.0005)*.17;}
    void main(){
     vec2 p=world.xz-vec2(0,travel);float shore=coast(p);
     float height=fbm(p*.012);float slope=fbm((p+vec2(2,5))*.012)-height;
     float ridges=pow(1.0-abs(noise(p*.017)*2.0-1.0),3.0);
     vec3 sea=mix(vec3(.035,.18,.29),vec3(.10,.43,.48),smoothstep(-.18,.01,shore));
     sea+=vec3(.06,.09,.09)*pow(noise(p*.06),7.0);
     vec2 fields=floor(p*.055+vec2(noise(p*.004)*5.0));
     vec3 farms=mix(vec3(.25,.34,.20),vec3(.43,.43,.25),hash(fields));
     vec3 forest=mix(vec3(.13,.25,.19),vec3(.31,.37,.25),height);
     vec3 land=mix(farms,forest,smoothstep(.4,.62,height));
     land=mix(land,vec3(.47,.46,.40),ridges*smoothstep(.60,.84,height)*.75);
     land*=clamp(.9+slope*10.0,.64,1.22);
     vec3 terrain=mix(sea,mix(vec3(.65,.60,.43),land,smoothstep(.008,.042,shore)),smoothstep(-.004,.008,shore));
     // Long valleys give a readable scale cue from both the cockpit and intro.
     float river=abs(sin(p.y*.005+fbm(p*.005)*9.0));
     terrain=mix(terrain,vec3(.14,.34,.38),(1.0-smoothstep(0.0,.018,river))*smoothstep(.055,.1,shore)*.6);
     float distanceToEye=length(world-cameraPosition);
     float haze=clamp(.22+1.0-exp(-distanceToEye*.00046),.22,.94);
     terrain=mix(terrain,vec3(.57,.70,.77),haze);
     gl_FragColor=vec4(terrain,1.0);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`} />
 </mesh>;
}
