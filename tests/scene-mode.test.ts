import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightGame } from '../server/src/systems/game.js';
import { BOARDING_DOCUMENTS, BOARDING_ENTRANCE, type Player } from '../shared/protocol.js';
import { isJourneyExterior, sceneMode } from '../client/src/game/sceneMode.js';

function fixture(training=true) {
 const game=new FlightGame('1234',training,()=>{});
 const ids=training?['host']:['host','crew','passenger'];
 for(const id of ids){game.addPlayer(id,id);game.handle(id,'ready',{ready:true});}
 const players=(game as unknown as {players:Map<string,Player>}).players;
 const collect=(id:string)=>{Object.assign(players.get(id)!,BOARDING_DOCUMENTS);game.handle(id,'boardingAction',{kind:'documents'});};
 const board=(id:string)=>{collect(id);Object.assign(players.get(id)!,BOARDING_ENTRANCE);game.handle(id,'boardingAction',{kind:'board'});};
 return {game,ids,collect,board};
}

test('intro ends at the terminal lobby and start stays at the gate until a real scan',()=>{
 const {game,collect,board}=fixture();
 assert.equal(sceneMode(null,'host'),'intro');
 assert.equal(sceneMode(game.snapshot(),'host'),'gate');
 game.handle('host','start',{});
 let snapshot=game.snapshot();
 assert.equal(snapshot.operations.stage,'boarding');
 assert.equal(sceneMode(snapshot,'host',true,true),'gate','legacy cinematic flags cannot override boarding');
 assert.equal(isJourneyExterior(snapshot,'host'),true);
 game.handle('host','boardingAction',{kind:'board'});
 assert.equal(sceneMode(game.snapshot(),'host'),'gate','an invalid boarding action cannot put the player in the cabin');
 collect('host');snapshot=game.snapshot();
 assert.equal(snapshot.operations.roster[0].documentsReceived,true);
 assert.equal(sceneMode(snapshot,'host'),'gate','collecting documents alone does not board');
 board('host');snapshot=game.snapshot();
 assert.equal(snapshot.operations.roster[0].boarded,true);
 assert.equal(sceneMode(snapshot,'host'),'cabin');
 assert.equal(isJourneyExterior(snapshot,'host'),false);
});

test('one boarding receipt cannot move another player out of the terminal',()=>{
 const {game,board}=fixture(false);game.handle('host','start',{});board('host');
 const snapshot=game.snapshot();
 assert.equal(sceneMode(snapshot,'host'),'cabin');
 for(const id of ['crew','passenger','unknown']){
  assert.equal(sceneMode(snapshot,id),'gate');assert.equal(isJourneyExterior(snapshot,id),true);
 }
});

test('takeoff, landing and crash scenes follow the shared flight stage for all players',()=>{
 const {game,board}=fixture();game.handle('host','start',{});board('host');
 const snapshot=game.snapshot();
 for(const stage of ['takeoff','landing','crashed','arrived'] as const){
  snapshot.operations.stage=stage;
  assert.equal(sceneMode(snapshot,'host'),'journey-flight');
  assert.equal(isJourneyExterior(snapshot,'host'),true);
 }
 snapshot.phase='ended';snapshot.operations.stage='crashed';
 assert.equal(sceneMode(snapshot,'host'),'journey-flight','the shared crash continues through the ended phase');
 snapshot.phase='playing';snapshot.operations.stage='cruise';
 assert.equal(sceneMode(snapshot,'host'),'cabin');
});

test('restart returns a boarded player to the terminal rather than the intro aircraft',()=>{
 const {game,board}=fixture();game.handle('host','start',{});board('host');
 const snapshot=game.snapshot();snapshot.phase='lobby';
 assert.equal(sceneMode(snapshot,'host',true,true),'gate');
});
