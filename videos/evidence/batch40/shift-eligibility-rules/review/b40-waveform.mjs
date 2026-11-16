// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const files=['videos/output/shift-eligibility-rules/audio/reserved.wav','/tmp/codex-video/b40-reserved-final.wav'];
const arrays=[];const hashes=[];
for(const f of files){const b=await readFile(f);hashes.push(createHash('sha256').update(b).digest('hex'));const {stdout}=await promisify(execFile)('ffmpeg',['-v','error','-i',f,'-af','highpass=f=200,lowpass=f=3000','-ar','8000','-ac','1','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:10000000});arrays.push(new Float32Array(stdout.buffer,stdout.byteOffset,stdout.length/4));}
const [a,b]=arrays;const windows=[];
for(let start=4000;start+3200<Math.min(a.length,b.length);start+=4000){let ea=0;for(let i=0;i<3200;i++)ea+=a[start+i]**2;if(ea/3200<0.00001)continue;let best={correlation:-1,lagSamples:0};for(let lag=-240;lag<=240;lag++){let ab=0,eb=0;for(let i=0;i<3200;i++){const x=a[start+i],y=b[start+i+lag]??0;ab+=x*y;eb+=y*y;}const c=ab/Math.sqrt(ea*eb);if(c>best.correlation)best={correlation:c,lagSamples:lag};}windows.push({startSeconds:start/8000,endSeconds:(start+3200)/8000,...best});}
const result={files,sha256:hashes,method:'Voice-band 200–3000 Hz; normalized waveform cross-correlation in voiced 0.4 s windows at 8 kHz; ±30 ms lag search. Amplitude changes and background music do not imply another speaker.',windows};await writeFile('videos/output/shift-eligibility-rules/review/reserved-waveform-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(windows));
