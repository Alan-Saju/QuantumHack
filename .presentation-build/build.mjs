import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile} from 'file:///C:/Users/alans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const root='D:/Projects/QuantumHack';
const build=root+'/.presentation-build';
const skill='C:/Users/alans/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const p=Presentation.create({slideSize:{width:1280,height:720}});
const C={dark:'#102D38',ink:'#15323C',teal:'#007E76',mint:'#7DE3D0',paper:'#F6F5F0',muted:'#547078',white:'#FFFFFF',soft:'#B7CED1',orange:'#B84B20'};
const font='Arial';
function text(s,t,x,y,w,h,size=28,color=C.ink,bold=false){
 const a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 a.text=t;a.text.style={typeface:font,fontSize:size,color,bold};return a;
}
function slide(title,n,dark=false){
 const s=p.slides.add();s.background.fill=dark?C.dark:C.paper;
 text(s,title,70,55,1130,100,48,dark?C.white:C.ink,true);
 text(s,String(n).padStart(2,'0'),1170,655,50,30,17,dark?C.soft:C.muted);
 return s;
}
function notes(s,t,src='README.md; QuantumRescue_Implementation_Plan.md'){s.speakerNotes.text=t+'\n\nProject sources: '+src+'. Repository snapshot reviewed 1 November 2026.';}

// 1. Minimal cover with editable typography.
let s=p.slides.add();s.background.fill=C.dark;
text(s,'QuantumRescue',70,168,1150,110,86,C.white,true);
text(s,'Ambulance route intelligence for Kochi',75,303,1050,60,38,C.mint);
text(s,'Classical routing today\nQuantum optimization on the roadmap',75,416,1000,100,29,C.soft);
text(s,'Hackathon showcase  /  Research prototype',75,637,1050,35,20,C.soft);
notes(s,'Suggested opening: QuantumRescue explores how an ambulance route should account for road access and vehicle fit alongside travel time. Our current prototype combines OSRM routing with a transparent scoring and validation layer. QUBO and QAOA are planned experiments, not completed features.');

// 2. Problem framing.
s=slide('The ambulance routing problem',2);
text(s,'Fast routes need\nusable roads',70,195,650,175,59,C.teal,true);
text(s,'Vehicle fit',805,190,380,45,29,C.ink,true);
text(s,'Width, height and weight restrictions can rule out a candidate.',805,243,375,95,25,C.muted);
text(s,'Changing conditions',805,365,390,45,29,C.ink,true);
text(s,'Congestion and closures can change which alternative is preferable.',805,418,375,95,25,C.muted);
text(s,'Prototype goal: compare routes and explain the choice.',75,560,1100,65,30,C.ink,true);
notes(s,'Frame this as the project’s design problem, not a measured claim about current emergency services. The prototype highlights known restrictions and uncertainty. Missing attributes remain unknown. It does not certify emergency suitability.');

// 3. Four editorial process rows.
s=slide('Our approach',3);
const rows=[['01','Generate','OSRM returns road-network route candidates.'],['02','Enrich','Python joins OSM road attributes and simulated traffic.'],['03','Validate and rank','Reject known violations, then score feasible candidates.'],['04','Explain','Leaflet shows the selected route, alternatives and warnings.']];
rows.forEach((r,i)=>{const y=186+i*105;text(s,r[0],75,y,75,55,34,C.teal,true);text(s,r[1],175,y,330,60,30,C.ink,true);text(s,r[2],535,y,665,78,27,C.muted);});
text(s,'Current stack: OpenStreetMap, OSRM, Python / FastAPI, Leaflet',75,635,1100,35,21,C.muted);
notes(s,'The routing engine proposes candidates. The Python layer adds project-specific intelligence without embedding a quantum algorithm inside OSRM. Current ranking compares the returned alternatives, so it does not prove a globally optimal path for custom costs. The existing frontend is a Leaflet application, not Angular.');

// 4. Scoring and validation.
s=slide('Route scoring and constraints',4,true);
text(s,'Feasibility first',75,187,500,55,39,C.mint,true);
text(s,'Known closures and access restrictions\nOne-way violations\nVehicle dimension limits',75,265,530,170,28,C.white);
text(s,'Then weighted cost',700,187,510,55,39,C.mint,true);
text(s,'Estimated travel time\nOptional congestion penalty\nUnknown-width and surface penalties',700,265,510,170,28,C.white);
text(s,'Missing road attributes stay visible as uncertainty.',75,508,1100,60,32,C.white,true);
text(s,'Traffic is simulated. Weights and penalties are experimental.',75,592,1100,45,23,C.soft);
notes(s,'The validator runs before ranking. Congestion affects travel time, and its separate score weight defaults to zero to avoid counting delay twice. Unknown width can be rejected with require_known_width, otherwise it carries a warning and suitability penalty. Restrictions cover a limited subset of conditions. No live traffic, clearance certification or validated operational ETA is claimed.');

// 5. Actual screenshot, not an invented product mockup.
s=slide('The working prototype',5);
const image=await fs.readFile(root+'/frontend/test-results/live-map.png');
s.images.add({blob:image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength),contentType:'image/png',alt:'Actual QuantumRescue map interface showing Kochi basemap and routing unavailable status',fit:'contain',position:{left:70,top:165,width:690,height:480}});
text(s,'Built',815,180,360,45,33,C.teal,true);
text(s,'Interactive Leaflet map\nLocation and coordinate inputs\nRoute inspection and error states\nClassical scoring API',815,242,375,220,27,C.ink);
text(s,'Next verification',815,495,390,45,29,C.teal,true);
text(s,'Real Kochi routes through local OSRM after map preparation.',815,552,375,85,25,C.muted);
notes(s,'Screenshot source: frontend/test-results/live-map.png. This is the actual interface with live OSM basemap tiles. The screenshot explicitly shows OSRM unavailable. Browser route interactions have been tested with mocked responses. Local OSRM preprocessing and live routing remain unverified in the project records. Map attribution: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright, ODbL. Leaflet: https://leafletjs.com/.','README.md; frontend/test-results/live-map.png');

// 6. Measured synthetic demo.
s=slide('A road closure changes the selection',6);
text(s,'Synthetic offline demo',75,153,1100,40,24,C.orange,true);
text(s,'Before closure',75,248,500,55,32,C.muted);
text(s,'20 sec',75,315,510,110,83,C.teal,true);
text(s,'Preferred route: osrm-0',75,450,510,50,27,C.ink);
text(s,'After closure',710,248,500,55,32,C.muted);
text(s,'30 sec',710,315,510,110,83,C.ink,true);
text(s,'Alternative route: osrm-1',710,450,510,50,27,C.ink);
text(s,'The blocked baseline is excluded from fallback.',75,558,1100,65,31,C.ink,true);
notes(s,'Run: .\\qiskit-env\\Scripts\\python.exe -m scripts.offline_demo. The run selected osrm-0 with estimated_time_s 20.0. Blocking directed segment 1:2 selected osrm-1 with estimated_time_s 30.0, and blocked_baseline_returned_as_fallback was false. These routes, IDs, attributes and times are synthetic. This demonstrates pipeline behavior, not Kochi travel times or a real-world benefit. Closures only filter available candidates and do not modify the OSRM graph.','scripts/offline_demo.py; examples/osrm-demo-response.json; data/road_network/demo.json; observed offline demo output');

// 7. Planned quantum work.
s=slide('The quantum experiment',7,true);
text(s,'Planned next',75,160,1100,40,23,C.mint,true);
text(s,'Small road graph\nBinary edge choices',75,250,510,125,43,C.white,true);
text(s,'QUBO objective\nCost plus constraint penalties',700,250,510,125,36,C.mint,true);
text(s,'QAOA with Qiskit Aer',75,430,540,60,33,C.white,true);
text(s,'Decode samples and reject invalid paths.',75,503,530,80,27,C.soft);
text(s,'Exact classical benchmark',700,430,520,60,33,C.white,true);
text(s,'Compare feasibility, cost gap and runtime on the same graph.',700,503,510,95,27,C.soft);
text(s,'QUBO and QAOA are not implemented yet. No quantum advantage claimed.',75,637,1110,35,20,C.soft);
notes(s,'Use binary edge variables with flow-conservation penalties. Start with a small graph and verify the QUBO optimum against an exact classical solution. Flow conservation can allow disconnected cycles, so explicitly detect or constrain those. Run shallow QAOA on Qiskit Aer, validate the samples and retain only feasible results. Compare identical costs, graph and constraints. Simulator experiments alone do not establish quantum advantage.');

// 8. Roadmap and close.
s=slide('Roadmap and success criteria',8);
const roadmap=[['Next','Verify local routing','Prepare Kochi map data and pass Route, Nearest and Table checks.'],['Then','Validate route intelligence','Check scoring and closure scenarios on real candidate routes.'],['After','Benchmark QUBO and QAOA','Compare feasible samples with an exact classical optimum.'],['Later','Explore a validated pilot','Add licensed traffic data and assess authoritative road coverage.']];
roadmap.forEach((r,i)=>{const y=175+i*101;text(s,r[0],75,y,120,50,25,C.teal,true);text(s,r[1],235,y,440,55,29,C.ink,true);text(s,r[2],715,y,485,85,25,C.muted);});
text(s,'Target outcome: an explainable route comparison demo for Kochi',75,601,1120,55,30,C.teal,true);
text(s,'Research prototype. Operational use requires field validation and approvals.',75,665,1090,30,17,C.muted);
notes(s,'Close on the immediate milestone: two Kochi locations produce real OSRM route geometry through FastAPI. Later success means transparent cost breakdowns and a fair quantum comparison, not an assumed speedup. A pilot would require emergency-service partners, authoritative constraints, field validation and operational approval. The roadmap indicates sequence, not a committed delivery schedule.');

await fs.mkdir(build,{recursive:true});
await fs.mkdir(root+'/deliverables',{recursive:true});
await (await PresentationFile.exportPptx(p)).save(build+'/candidate.pptx');
for(let i=0;i<p.slides.items.length;i++){
 const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(build+`/slide-${i+1}.png`,new Uint8Array(await blob.arrayBuffer()));
}
const {finalizePresentation}=await import(pathToFileURL(skill+'/container_tools/artifact_tool_utils.mjs').href);
// This Windows workspace disallows hard links. Preserve exclusive creation
// and all finalizer checks using an exact byte copy for the publish step.
const linkOriginal=fs.link;
fs.link=async(from,to)=>{try{return await linkOriginal(from,to);}catch(e){if(e.code!=='EPERM')throw e;return fs.copyFile(from,to,fsConstants.COPYFILE_EXCL);}};
const result=await finalizePresentation({workspaceDir:root,candidatePath:build+'/candidate.pptx',finalPath:root+'/deliverables/QuantumRescue_Hackathon.pptx',pythonExecutable:'C:/Users/alans/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:8,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,receiptPath:build+'/validation.json'});
console.log(JSON.stringify(result));
