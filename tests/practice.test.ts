import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecord, emptyTimer, remainingTime, sessionSchema } from '../src/lib/practice';
test('absolute deadline accounts for background time and clamps at zero',()=>{
  const timer={remaining:600000,deadline:700000,started:true};
  assert.equal(remainingTime(timer,150000),550000);
  assert.equal(remainingTime(timer,900000),0);
});
test('paused timer does not elapse and initial timer does not start',()=>{
  assert.equal(remainingTime(emptyTimer(),50000000),600000);
  assert.equal(remainingTime({remaining:32000,deadline:null,started:true},50000000),32000);
});
test('history is capped at 30 and finishing the same session is idempotent',()=>{
  const make=(id:string)=>({id,word:'测试',category:'ai',minutes:3,date:'2026-09-12'});
  const list=Array.from({length:30},(_,i)=>make(String(i)));
  assert.equal(addRecord(list,make('new')).length,30);
  assert.equal(addRecord(list,make('0')).length,30);
  assert.equal(addRecord(list,make('new'))[0].id,'new');
});
test('corrupt browser state is rejected',()=>{
  assert.equal(sessionSchema.safeParse({stage:'bad',timer:{deadline:'tomorrow'}}).success,false);
});
