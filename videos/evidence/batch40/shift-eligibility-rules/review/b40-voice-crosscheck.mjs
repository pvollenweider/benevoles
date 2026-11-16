// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir='videos/output/shift-eligibility-rules';
const timeline=JSON.parse(await readFile(`${dir}/timeline.json`,'utf8'));const cue=timeline.cues.find(c=>c.id==='reserved');
await promisify(execFile)('ffmpeg',['-v','error','-y','-ss',String(cue.startMs/1000),'-i',`${dir}/shift-eligibility-rules.mp4`,'-t',String((cue.endMs-cue.startMs)/1000),'-vn','-ar','24000','-ac','1','/tmp/codex-video/b40-reserved-final.wav']);
const prompt="Écoute cet extrait sonore en entier. Combien de personnes prononcent les phrases de narration ? Décris leur identité vocale et toute rupture de locuteur réellement audible, notamment entre les phrases. Distingue une variation naturelle de timbre d'un changement de personne. Ne déduis rien du contenu des phrases. Réponds uniquement en JSON {speakers:number, consistentVoice:boolean, changes:[{seconds:number,observation:string}], evidence:string}. Aucun transcript attendu n'est fourni.";
const reports=[];
for (const file of [`${dir}/audio/reserved.wav`,'/tmp/codex-video/b40-reserved-final.wav']) {
 const bytes=await readFile(file);const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:prompt},{inlineData:{mimeType:'audio/wav',data:bytes.toString('base64')}}]}],generationConfig:{responseMimeType:'application/json',temperature:0}})});
 if(!response.ok)throw Error(`HTTP ${response.status}`);const body=await response.json();const result=JSON.parse(body.candidates[0].content.parts.filter(p=>!p.thought).map(p=>p.text??'').join(''));reports.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),result});
}
await writeFile(`${dir}/review/reserved-voice-crosscheck.json`,JSON.stringify({auditedAt:new Date().toISOString(),prompt,reports},null,2));console.log(JSON.stringify(reports.map(r=>r.result)));
