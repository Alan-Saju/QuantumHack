import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile} from 'file:///C:/Users/alans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const root='D:/Projects/QuantumHack';
const build=root+'/.presentation-build/quantum-architecture';
const out=root+'/deliverables/QuantumRescue_Architecture_Quantum_Logic.pptx';
const skill='C:/Users/alans/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const runtimePython='C:/Users/alans/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
process.env.RUNTIME_NODE_MODULES='C:/Users/alans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const p=Presentation.create({slideSize:{width:1280,height:720}});
const C={ink:'#15333D',teal:'#006F66',mint:'#9DE1CC',paper:'#F7F7F2',muted:'#50666E',white:'#FFFFFF',soft:'#DAE8E4',orange:'#A54B23',dark:'#102D38'};
function text(s,value,x,y,w,h,size=28,color=C.ink,bold=false){
 const a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 a.text=value;a.text.insets=0;a.text.style={typeface:'Arial',fontSize:size,color,bold};return a;
}
function slide(title,dark=false){const s=p.slides.add();s.background.fill=dark?C.dark:C.paper;text(s,title,64,48,1152,102,46,dark?C.white:C.ink,true);text(s,String(p.slides.items.length).padStart(2,'0'),1160,666,56,30,19,dark?C.mint:C.muted);return s;}
function note(s,body,sources=[]){s.speakerNotes.text=body+'\n\nSources: '+sources.join('\n')+'\nRepository implementation reviewed 1 November 2026. Research prototype.';}
function node(s,label,x,y,w=270,h=100,accent=false){const a=s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill:accent?C.teal:C.white,line:{fill:accent?C.teal:C.soft,width:1.5}});text(s,label,x+16,y+15,w-32,h-24,24,accent?C.white:C.ink,true);return a;}
function link(s,a,b,from='right',to='left'){return s.shapes.connect(a,b,{kind:from==='right'&&to==='left'?'straight':'elbow',fromSide:from,toSide:to,line:{fill:C.muted,width:2},tail:{type:'triangle',width:'med',length:'med'}});}
function row(s,label,body,y,dark=false){text(s,label,70,y,330,72,29,dark?C.mint:C.teal,true);text(s,body,440,y,750,92,27,dark?C.white:C.ink);}
const code=f=>root+'/'+f;
const quantumSource='https://quantum.cloud.ibm.com/docs/en/tutorials/quantum-approximate-optimization-algorithm';
const stateSource='https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.quantum_info.Statevector';

// 1. Cover
let s=p.slides.add();s.background.fill=C.dark;
text(s,'QuantumRescue',70,170,1140,108,82,C.white,true);
text(s,'Architecture and quantum logic',74,305,1120,66,41,C.mint);
text(s,'QAOA for ambulance, incident and hospital allocation',74,420,1080,84,31,C.white);
text(s,'Technical review\n1 November 2026',74,594,1090,70,22,C.mint);
note(s,'Opening: Our current quantum model selects dispatch assignments across incidents. OSRM provides journey times and road geometry. The experiment uses local noiseless Qiskit statevector simulation and compares QAOA samples with an exact classical baseline. We have not implemented a QUBO that selects individual road edges.',[code('backend/allocation/service.py'),code('backend/allocation/qaoa.py')]);

// 2. Problem
s=slide('The dispatch decision');
text(s,'3 ambulances × 3 incidents × 3 hospitals',70,175,1130,75,43,C.teal,true);
text(s,'Up to 27 served assignment choices',70,272,1120,65,38,C.ink,true);
row(s,'A choice','One ambulance attends one incident and transports the patient to one hospital.',375);
row(s,'A complete plan','Each incident gets one choice. Ambulances and hospital slots cannot be reused in the round.',493);
text(s,'The 27-choice count assumes every combination is eligible.',70,632,1090,38,22,C.muted);
note(s,'The product 3×3×3 counts served choices, not circuit executions or valid complete plans. Medical capability and availability filters reduce the choices. The implementation also adds one unserved choice per incident. Current limits: up to 3 ambulances, 3 incidents and 5 hospitals, with one receiving slot per hospital.',[code('backend/allocation/scenario.py'),code('backend/allocation/qubo.py')]);

// 3. Editable architecture
s=slide('System architecture');
const ui=node(s,'Leaflet dashboard\nResource scenario',65,165,280,100);
const api=node(s,'FastAPI\nScenario orchestration',490,165,280,100);
const osrm=node(s,'Travel provider\nOSRM or synthetic',915,165,300,100);
const exact=node(s,'Exact classical solver\nFull eligible choices',65,345,280,110);
const qubo=node(s,'Choices and QUBO\nFull + retained sets',490,345,280,110,true);
const qaoa=node(s,'QAOA simulator\nCircuit and COBYLA',915,345,300,110,true);
const validate=node(s,'Sample validation\nFeasibility and cost',915,535,300,100);
const choose=node(s,'Compare and select\nExact fallback',490,535,280,100);
link(s,ui,api);link(s,api,osrm);
link(s,osrm,qubo,'bottom','top');link(s,qubo,qaoa);link(s,qubo,exact,'left','right');
link(s,qaoa,validate,'bottom','top');link(s,validate,choose,'left','right');link(s,exact,choose,'bottom','left');
text(s,'Selected assignments and road geometry return to the dashboard.',65,653,1030,33,21,C.muted);
note(s,'Read left to right across inputs, then down into optimization. The travel provider supplies response and transport times. The backend builds the full eligible choice set, runs an exact reference, and constructs a reduced QUBO for QAOA. The validation layer rejects conflicting samples and compares original assignment costs. The service returns the chosen plan and a selection reason. The exact solver uses full_groups, not just the shortlisted quantum choices. Diagram connectors and labels are editable.',[code('backend/main.py'),code('backend/allocation/service.py'),code('backend/allocation/qubo.py')]);

// 4. Model boundary
s=slide('Road routing and resource allocation');
text(s,'OSRM',70,180,500,65,43,C.teal,true);
text(s,'Which road journey connects\ntwo locations?',70,270,510,110,34,C.ink,true);
text(s,'Real road geometry\nEstimated journey duration\nFastest returned candidate per leg',70,431,520,150,27,C.muted);
text(s,'QAOA',690,180,500,65,43,C.teal,true);
text(s,'Which assignments should\nwe select together?',690,270,520,110,34,C.ink,true);
text(s,'Ambulance and incident pairing\nHospital compatibility\nConflicts across assignments',690,431,520,150,27,C.muted);
text(s,'Current quantum variables represent assignments. Road-edge optimization is future work.',70,630,1125,42,23,C.orange);
note(s,'In OSRM mode, service.osrm_leg requests candidates and selects the minimum duration_s for each journey leg. It does not let QAOA choose the road edges within that leg. In synthetic mode, the code uses great-circle distances and a constant 30 km/h to estimate travel, drawing straight connectors. Road width, surface and vehicle clearance are not integrated into the allocation objective.',[code('backend/allocation/service.py'),code('backend/allocation/qubo.py')]);

// 5. Costs
s=slide('Assignment costs');
text(s,'c = severity × response time + transport weight × transport time',70,176,1140,110,36,C.teal,true);
row(s,'Response time','Minutes from the ambulance to the incident.',330);
row(s,'Transport time','Minutes from the incident to a compatible hospital.',435);
text(s,'Illustration: severity 3, response 4 min, transport 8 min, weight 1',70,557,1120,46,25,C.muted);
text(s,'Assignment cost = 3 × 4 + 1 × 8 = 20',70,615,1090,50,31,C.ink,true);
note(s,'This numerical example illustrates the formula and is not a measured route result. The weighted objective is not the same as elapsed journey time, which would be 12 minutes in the example. The code filters unavailable ambulances, hospitals with no slots, and medical capability mismatches before computing choices. The unserved cost is severity times U, where U is one plus the sum of the maximum served cost in each incident group.',[code('backend/allocation/qubo.py')]);

// 6. Constraints
s=slide('Dispatch constraints');
row(s,'One choice per incident','Select a served assignment or the explicit unserved option.',185);
row(s,'One job per ambulance','Prevent the same ambulance from handling two incidents in one round.',300);
row(s,'One hospital slot','Prevent two assignments from using the same receiving slot.',415);
row(s,'Medical compatibility','Remove unavailable or incompatible combinations before optimization.',530);
note(s,'Exactly one choice is enforced per incident group. compatible() checks uniqueness of ambulance_id and hospital_id across served choices. Hospital.available_slots is currently restricted to zero or one. There is no multi-round scheduling or vehicle reuse over time. Unserved is a deliberate feasible outcome, with a large cost, rather than an invalid missing decision.',[code('backend/allocation/qubo.py'),code('backend/allocation/scenario.py')]);

// 7. QUBO
s=slide('The implemented QUBO',true);
text(s,'Q(x) = Σ cₖxₖ + P Σᵢ (1 − Σₖ∈Gᵢ xₖ)²\n           + P Σ₍ₖ,ₗ₎∈F xₖxₗ',70,182,1130,155,39,C.white,true);
text(s,'Gᵢ contains the retained choices for incident i',70,375,1120,55,28,C.mint);
text(s,'F contains choices for different incidents that share an ambulance or hospital',70,450,1120,85,28,C.white);
text(s,'P = 1 + Σᵢ maxₖ∈Gᵢ cₖ',70,569,1110,60,33,C.mint,true);
note(s,'The code stores an upper-triangular Q matrix plus an offset. Expanding the one-choice square gives diagonal c_k−P, pair coefficient 2P for choices in the same incident group, and constant P per group. A conflicting pair across different incidents receives P once even if it shares both an ambulance and hospital. The stored penalty is one plus the sum of the maximum retained cost in each incident group. This formula represents the implementation, not the earlier planned edge-flow QUBO.',[code('backend/allocation/qubo.py')]);

// 8. Single qubit
s=slide('One qubit represents one candidate choice');
text(s,'Example decision',70,168,1100,50,27,C.muted);
text(s,'Ambulance A1 attends incident I2\nand transports to hospital H3',70,236,1130,126,43,C.teal,true);
text(s,'|0⟩',80,421,220,80,60,C.ink,true);text(s,'Assignment excluded',300,443,820,55,31,C.ink);
text(s,'|1⟩',80,527,220,80,60,C.teal,true);text(s,'Assignment selected',300,549,820,55,31,C.ink);
text(s,'Before measurement: |ψ⟩ = α|0⟩ + β|1⟩',70,638,1100,42,27,C.muted);
note(s,'Each retained Choice becomes one qubit in QuantumCircuit(n). The bit is a decision indicator, not a physical ambulance, hospital, road node or road segment. Measurement probabilities for a standalone qubit are |α|² and |β|². The full correlated multi-qubit state encodes probabilities over assignment combinations. No ambulance is dispatched by a superposition itself. The simulator returns classical samples that the backend decodes and validates.',[code('backend/allocation/qaoa.py'),code('backend/allocation/qubo.py'),stateSource]);

// 9. Bitstrings
s=slide('A measured state becomes a complete plan');
text(s,'Illustration: one ambulance, three incidents, three eligible hospitals',70,165,1130,70,29,C.muted);
text(s,'Each incident block uses [H1, H2, H3, Unserved]',70,244,1130,60,31,C.teal,true);
text(s,'1000     0001     0001',70,344,1130,80,48,C.ink,true);
text(s,'Serve incident 1 at H1. Leave incidents 2 and 3 unserved.',70,436,1120,70,29,C.ink);
text(s,'12 qubits give 4,096 possible bitstrings',70,548,1120,55,33,C.teal,true);
text(s,'Only 10 are valid in this illustration: nine served plans plus all unserved.',70,617,1120,58,24,C.muted);
note(s,'The blocks appear in application variable order. With one ambulance, at most one incident can be served in a single round. There are nine ways to pick one of three incidents and one of three hospitals, plus the all-unserved plan, assuming all nine served choices are eligible. The other 4,086 bitstrings violate one-choice or resource constraints. This example differs from the actual default scenario, which has three ambulances and medical capability filters. Qiskit raw bitstring display ordering may differ, so the implementation explicitly extracts bits using bit shifts indexed by qubit number.',[code('backend/allocation/qaoa.py'),code('backend/allocation/qubo.py')]);

// 10. Budget
s=slide('The retained model uses at most 12 qubits');
text(s,'Full 3 × 3 × 3 model',70,185,530,55,32,C.muted);
text(s,'Up to 30',70,260,540,100,71,C.ink,true);
text(s,'27 served choices plus\n3 unserved choices',70,390,530,110,31,C.ink);
text(s,'Current quantum model',700,185,510,55,32,C.muted);
text(s,'Up to 12',700,260,510,100,71,C.teal,true);
text(s,'Per incident: three cheapest\nserved choices plus unserved',700,390,510,110,31,C.ink);
text(s,'Default 3-hospital demo: 10 qubits. 5-hospital demo: 12 qubits.',70,557,1120,55,28,C.teal,true);
text(s,'Shortlisting can remove the full optimum. The exact solver checks all eligible choices.',70,632,1120,42,23,C.orange);
note(s,'For the unfiltered 3×3×3 scenario the full choice count is 30 including unserved. build_problem retains group[:-1][:3] plus the unserved choice. At most three incidents times four retained choices gives 12 qubits. Direct calculation from demo_scenario with synthetic travel gives retained group sizes [3,3,4] for three hospitals, hence 10 qubits and 16 full choices. With five hospitals it gives [4,4,4], hence 12 qubits and 26 full choices. These are configuration counts, not benchmark outcomes.',[code('backend/allocation/qubo.py'),code('backend/allocation/scenario.py')]);

// 11. Circuit, editable technical diagram
s=slide('QUBO conversion and circuit gates');
text(s,'xₖ = (I − Zₖ) / 2',70,158,1120,65,38,C.teal,true);
text(s,'Hcost = constant + Σ hₖZₖ + Σ JₖₗZₖZₗ',70,239,1120,70,34,C.ink);
text(s,'Two illustrative choice qubits',70,338,1120,40,24,C.muted);
const gates=[];
const probabilityNode=node(s,'Joint statevector\nprobabilities',945,400,260,185);
for(const [idx,y] of [[0,400],[1,515]]){
 text(s,`q${idx}`,70,y+15,70,45,28,C.ink,true);
 const h=node(s,'H',170,y,95,70);const rz=node(s,'RZ',345,y,115,70);const zz=node(s,'RZZ',540,y,130,70,true);const rx=node(s,'RX',750,y,115,70);
 link(s,h,rz);link(s,rz,zz);link(s,zz,rx);
 s.shapes.connect(rx,probabilityNode,{kind:'elbow',fromSide:'right',toSide:'left',line:{fill:C.muted,width:2},tail:{type:'triangle'}});
 gates.push(zz);
}
s.shapes.connect(gates[0],gates[1],{kind:'straight',fromSide:'bottom',toSide:'top',line:{fill:C.muted,width:2}});
text(s,'H prepares superposition. RZ/RZZ encode cost. RX mixes choices.',70,625,1120,45,25,C.muted);
note(s,'This is a schematic circuit fragment, not the complete transpiled circuit. The same RZZ interaction acts across a pair of choice qubits. The implementation converts diagonal QUBO terms into Z coefficients and off-diagonal terms into Z and ZZ coefficients. It applies RZ(2γh/scale), RZZ(2γJ/scale) and RX(2β), after Hadamard preparation. It divides Hamiltonian coefficients by a common scale while retaining the same relative objective. The diagram ends at statevector probabilities because the actual implementation samples a multinomial from those probabilities after optimization, rather than inserting hardware measurement instructions.',[code('backend/allocation/qaoa.py'),quantumSource]);

// 12. Hybrid loop
s=slide('The hybrid optimization loop');
const angles=node(s,'Circuit angles\ngamma and beta',70,190,295,105);
const qc=node(s,'QAOA circuit\n1 to 3 layers',490,190,295,105,true);
const sv=node(s,'Qiskit Statevector\nExact probabilities',910,190,300,105);
const opt=node(s,'COBYLA\nClassical parameter search',490,405,295,110);
const expectation=node(s,'Expected QUBO cost\nSum of probability × cost',910,405,300,110);
link(s,angles,qc);link(s,qc,sv);link(s,sv,expectation,'bottom','top');link(s,expectation,opt,'left','right');link(s,opt,angles,'left','bottom');
text(s,'After tuning: sample the final distribution, then validate assignments.',70,575,1130,65,30,C.teal,true);
text(s,'Default: p = 1, budget = 30, final samples = 1,024',70,650,1110,35,23,C.muted);
note(s,'At depth p the circuit has 2p adjustable angles. evaluate() builds a statevector and calculates an exact expectation from all basis-state probabilities. scipy.optimize.minimize uses COBYLA with the requested maxiter budget and a seeded initial point. The code keeps the best evaluated parameters, including when the optimizer exhausts its budget. Final sampling uses a seeded multinomial draw. Shots are final sample count, not repeated complete optimization runs. Current settings allow reps 1–3, shots 64–8192, and maxiter 10–100. No Aer or remote IBM hardware backend is currently used.',[code('backend/allocation/qaoa.py'),code('backend/allocation/scenario.py')]);

// 13. Selection
s=slide('Validation and classical comparison');
row(s,'Full exact reference','Enumerate compatible plans across all eligible choices.',177);
row(s,'Reduced exact reference','Find the optimum within the same shortlist used by QAOA.',287);
row(s,'QAOA sampled candidate','Keep the best feasible sample and calculate its original assignment cost.',397);
text(s,'The service returns QAOA only when its valid sample matches\nthe full exact optimum within tolerance. Otherwise it uses the exact fallback.',70,538,1120,100,30,C.teal,true);
note(s,'service.allocate always computes the exact full-scenario and reduced-scenario optima. It validates quantum assignments again at the service boundary: one choice per incident, choices present in the model and no ambulance or hospital reuse. It selects QAOA only if candidate cost ≤ full optimum + 1e−8. A worse sample, unavailable dependencies or absent feasible sample triggers exact fallback. Therefore a good displayed final result alone is not evidence that QAOA found it. Inspect selected_solver, selection_reason and quantum.objective separately.',[code('backend/allocation/service.py'),code('backend/allocation/qubo.py')]);

// 14. Laptop
s=slide('Laptop simulation limits',true);
text(s,'Statevector size grows as 2ⁿ',70,170,1120,65,42,C.mint,true);
row(s,'12 qubits','4,096 complex amplitudes. Our current application cap.',285,true);
row(s,'20 qubits','1,048,576 complex amplitudes.',390,true);
row(s,'30 qubits','Over one billion amplitudes. About 16 GiB for the state alone.',495,true);
text(s,'The 12-qubit cap is a prototype choice, not a measured hardware limit.',70,627,1120,45,24,C.mint);
note(s,'Memory arithmetic assumes 16 bytes per complex128 amplitude: 2^30 × 16 bytes = 16 GiB. This is a statevector-only estimate, not a measurement of the laptop. Our implementation also stores basis indices, a bit matrix, energies and probabilities, so total memory is higher. Repeated circuit evaluation adds runtime. The code uses classical simulation on the laptop, not twelve physical qubits. Larger qubit counts and deeper circuits require resource profiling and possibly a different execution strategy.',[code('backend/allocation/qaoa.py'),stateSource]);

// 15. Review / demo
s=slide('Evaluation and review demonstration');
row(s,'Travel data','Choose Local OSRM road routes. Synthetic mode uses straight connectors.',175);
row(s,'Solver output','Inspect selected solver and selection reason before describing a quantum result.',287);
row(s,'Quality measurements','Report feasible samples, sampled objective and gap to the full exact optimum.',399);
row(s,'Repeatability','Record seed, depth, optimizer budget and final sampling count.',511);
note(s,'Suggested demo narration: We first establish the travel-data source, then run QAOA plus the exact comparison. We inspect the QAOA candidate, whether it meets constraints, and why the application selected QAOA or classical fallback. Repeat with different seeds or settings before making a performance claim. A gap can arise from shortlisting or from QAOA search; compare full_exact_objective and reduced_exact_objective to distinguish these. No measured QAOA benchmark values are presented in this deck.',[code('frontend/src/allocation.js'),code('backend/allocation/service.py')]);

// 16. Scope
s=slide('Current implementation and next steps');
text(s,'Implemented',70,177,510,60,39,C.teal,true);
text(s,'Local OSRM road travel times\nExact assignment enumeration\nAssignment QUBO and QAOA circuit\nStatevector simulation and sampling\nValidation and dashboard comparison',70,270,540,270,27,C.ink);
text(s,'Next steps',700,177,510,60,39,C.teal,true);
text(s,'Road-attribute costs in allocation\nControlled benchmark scenarios\nNoise and hardware experiments\nLarger models after profiling\nSeparate road-edge QUBO research',700,270,510,270,27,C.ink);
text(s,'Research demonstration. Simulator execution does not establish quantum advantage.',70,613,1120,65,26,C.orange);
note(s,'Close: The implemented quantum problem is joint emergency resource allocation. The earlier planned edge-selection routing formulation is separate future work. Current allocation costs use response time, severity and hospital transport time. Road-width, surface, clearance and live traffic are not yet integrated into that allocation model. The underlying route API can preserve available attributes separately. Operational dispatch would require authoritative data, field validation and approvals. The deck makes no claim of quantum speedup or real emergency suitability.',[code('backend/allocation/service.py'),code('backend/allocation/qubo.py'),code('backend/allocation/qaoa.py'),code('backend/intelligence/cost_calculator.py')]);

await fs.mkdir(build,{recursive:true});await fs.mkdir(path.dirname(out),{recursive:true});
await (await PresentationFile.exportPptx(p)).save(build+'/candidate.pptx');
for(let i=0;i<p.slides.items.length;i++){
 const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(build+`/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await blob.arrayBuffer()));
 console.log('Rendered',i+1);
}
const {finalizePresentation}=await import(pathToFileURL(skill+'/container_tools/artifact_tool_utils.mjs').href);
const originalLink=fs.link;
fs.link=async(from,to)=>{try{return await originalLink(from,to);}catch(e){if(e.code!=='EPERM')throw e;return fs.copyFile(from,to,fsConstants.COPYFILE_EXCL);}};
const result=await finalizePresentation({workspaceDir:root,candidatePath:build+'/candidate.pptx',finalPath:out,pythonExecutable:runtimePython,integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:16,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,receiptPath:build+'/validation.json'});
console.log(JSON.stringify(result));
