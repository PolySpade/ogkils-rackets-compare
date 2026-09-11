/**
 * Manual eval harness for the Racket Assistant (product.md §8).
 *
 *   pnpm assistant:eval            # run every case
 *   pnpm assistant:eval fallback   # only cases that fell back
 *
 * The vitest suite in src/lib/assistant.test.ts asserts behaviour; this prints the
 * actual prose so you can read it as a player would. Add a question here the moment a
 * real one comes in from the `assistant_fallback` analytics event, then fix the rules
 * until it reads well. It is a dev tool — nothing imports it at build time.
 */
import { answer, emptyContext, type AssistantContext, type AssistantData } from '../src/lib/assistant';
import { catalog } from '../src/lib/data';
import { allTerms } from '../src/lib/glossary';

const data: AssistantData = { rackets: catalog, glossary: allTerms(), buys: {} };

const SINGLE_TURN = [
  // specs and yes/no
  'how heavy is the fire breathing',
  'whats the swing weight of the dspro',
  'how long is the wind breathing',
  'can i string the ld100zz at 32 lbs',
  'does the freezing come in g6',
  'is the annihilation head heavy',
  // ranking
  'cheapest attack racket',
  'which racket has the biggest head',
  'what is the heaviest racket you have',
  'stiffest racket',
  'most flexible racket in the ld series',
  // filtering
  'do you have anything under 4000',
  'show me head light rackets under 5000',
  'i want something stiff and head heavy',
  'show me rackets that use toray',
  'anything under 1000',
  'compare all the breathing rackets',
  // guidance
  'is the fire breathing good for a beginner',
  'what racket should i get if i have tennis elbow',
  'anong maganda pang smash',
  'i am a beginner what should i buy',
  // comparison
  'which is lighter, fire breathing or wind breathing',
  'is the 88d better than the 88s',
  // explanation and meta
  'whats the difference between 3u and 4u',
  'what is vibranium',
  'what rackets do you have',
  'hi',
  'are you chatgpt',
  'qwerty zxcv',
];

const THREADS: string[][] = [
  ['fire breathing vs thunder breathing', 'which one is more forgiving', 'how much is it'],
  ['tell me about the ld100zz', 'can i string it at 30 lbs', 'does it come in g6', 'where can i buy it'],
  ['i am a beginner', 'i mostly play doubles at the net', 'what do you recommend'],
];

const only = process.argv[2];
let fellBack = 0;

console.log('=== single turn ===');
for (const q of SINGLE_TURN) {
  const res = answer(q, data);
  if (res.fellBack) fellBack += 1;
  if (only && !res.intent.includes(only) && !(only === 'fallback' && res.fellBack)) continue;
  console.log(`\n[${res.intent}] ${q}`);
  console.log(`   ${res.text.replace(/\n/g, '\n   ')}`);
}

console.log('\n\n=== multi turn ===');
for (const queries of THREADS) {
  console.log('\n---');
  let ctx: AssistantContext = emptyContext();
  for (const q of queries) {
    const res = answer(q, data, ctx);
    ctx = res.context;
    if (res.fellBack) fellBack += 1;
    console.log(`  > ${q}`);
    console.log(`  [${res.intent}] ${res.text.replace(/\n/g, ' ')}`);
  }
}

const total = SINGLE_TURN.length + THREADS.reduce((n, t) => n + t.length, 0);
console.log(`\n\n${total - fellBack}/${total} answered, ${fellBack} fell back.`);
