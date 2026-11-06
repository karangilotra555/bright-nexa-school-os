/* Teacher-reviewed offline draft builder: deterministic, never an AI or syllabus assertion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BNTeacherGenerator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TOOLS=['Lesson Plan Generator','Worksheet Generator','Question Paper Generator','Homework Generator','Student Remark Generator','Parent Message Generator','Weak Student Remedial Plan','Activity Ideas Generator','Class Test Generator','School Notice Generator'];
const FACTS=[
 ['Carbohydrates primarily provide energy. Common sources include rice, wheat and potatoes.','कार्बोहाइड्रेट ऊर्जा देते हैं। उदाहरण: चावल, गेहूँ और आलू।'],
 ['Proteins support growth and tissue repair. Pulses, beans and milk are common sources.','प्रोटीन वृद्धि और ऊतकों की मरम्मत में मदद करते हैं। दालें, फलियाँ और दूध स्रोत हैं।'],
 ['Fats provide concentrated energy. Nuts, seeds and cooking oils contain fats.','वसा सघन ऊर्जा देती है। मेवे, बीज और तेल इसके स्रोत हैं।'],
 ['Vitamins and minerals support normal body functions. Variety in fruits and vegetables matters.','विटामिन और खनिज शरीर की सामान्य क्रियाओं में मदद करते हैं। फल-सब्जियों की विविधता उपयोगी है।'],
 ['Roughage (dietary fibre) helps bowel movement; vegetables, fruits and whole grains provide it.','आहारीय रेशा पाचन में मदद करता है। सब्जियाँ, फल और साबुत अनाज इसके स्रोत हैं।'],
 ['Water is essential for hydration and transport of substances in the body.','जल शरीर में नमी और पदार्थों के परिवहन के लिए आवश्यक है।']
];
const FOOD_QUESTIONS=[
 ['Name two common foods rich in carbohydrates.','कार्बोहाइड्रेट वाले दो भोजन लिखिए।'],
 ['Why does the body need proteins? Give one food source.','शरीर को प्रोटीन की जरूरत क्यों है? एक स्रोत लिखिए।'],
 ['Which nutrient is a concentrated energy source? Give an example.','कौन सा पोषक तत्व सघन ऊर्जा देता है? उदाहरण दीजिए।'],
 ['What do we mean by a balanced diet?','संतुलित आहार से क्या अभिप्राय है?'],
 ['Explain why eating only rice every day is not a balanced diet.','केवल चावल खाना संतुलित आहार क्यों नहीं है?'],
 ['Name two foods that contain dietary fibre.','आहारीय रेशा वाले दो भोजन लिखिए।'],
 ['List two functions of water in the body.','शरीर में जल के दो कार्य लिखिए।'],
 ['Compare proteins and carbohydrates by their main functions.','प्रोटीन और कार्बोहाइड्रेट के मुख्य कार्यों की तुलना कीजिए।'],
 ['A child eats only fried snacks. Suggest two improvements to the meal and explain why.','बच्चा केवल तली चीजें खाता है। भोजन में दो सुधार कारण सहित बताइए।'],
 ['Classify rice, dal, oil and guava by their major nutritional contributions.','चावल, दाल, तेल और अमरूद का प्रमुख पोषण योगदान बताइए।'],
 ['Why are fruits and vegetables important even when energy-rich food is available?','ऊर्जा देने वाले भोजन के साथ फल-सब्जियाँ क्यों जरूरी हैं?'],
 ['Design a one-day meal containing different food groups and justify your choices.','अलग-अलग भोजन समूहों वाला एक दिन का आहार बनाएँ और कारण लिखें।']
];
const FOOD_MCQ=[
 ['Which food mainly provides carbohydrates? (A) Rice (B) Oil (C) Salt (D) Water','किस भोजन में कार्बोहाइड्रेट प्रमुख है? (A) चावल (B) तेल (C) नमक (D) जल','A'],
 ['Which nutrient supports growth and repair? (A) Protein (B) Fibre (C) Water (D) Salt','वृद्धि और मरम्मत में कौन मदद करता है? (A) प्रोटीन (B) रेशा (C) जल (D) नमक','A'],
 ['Which is a protein-rich option? (A) Lentils (B) Sugar (C) Oil (D) Salt','किसमें प्रोटीन अधिक है? (A) दाल (B) चीनी (C) तेल (D) नमक','A'],
 ['Which contributes dietary fibre? (A) Whole grains (B) Refined sugar (C) Salt (D) Pure oil','कौन रेशा देता है? (A) साबुत अनाज (B) चीनी (C) नमक (D) तेल','A'],
 ['Which is essential for hydration? (A) Water (B) Salt only (C) Oil (D) Starch','शरीर में जल की पूर्ति के लिए क्या जरूरी है? (A) पानी (B) केवल नमक (C) तेल (D) स्टार्च','A']
];
function choose(lang,en,hi){return lang==='Hindi'?hi:lang==='Bilingual'?en+'\n'+hi:en;}
function safe(v,max,label){const s=String(v==null?'':v).trim();if(!s||s.length>max)throw Error(label+' must be 1–'+max+' characters.');return s;}
function isFood(subject,topic){return /scien|evs|विज्ञान/i.test(subject)&&/food components|components of food|food nutrients|भोजन.*घटक|पोषक तत्व/i.test(topic);}
function mins(s){if(/double|80/.test(s.toLowerCase()))return 80;if(/1 hour|60/.test(s.toLowerCase()))return 60;const m=s.match(/\d+/);return m?+m[0]:45;}
function parse(input){
 const x=input||{},tool=safe(x.tool,90,'Tool'),className=safe(x.className,90,'Class'),subject=safe(x.subject,100,'Subject'),topic=safe(x.topic,140,'Topic');
 if(!TOOLS.includes(tool))throw Error('Unknown generator type.');
 const language=x.language||'English';if(!['English','Hindi','Bilingual'].includes(language))throw Error('Choose a valid output language.');
 const difficulty=x.difficulty||'Medium';if(!['Easy','Medium','Hard'].includes(difficulty))throw Error('Choose valid difficulty.');
 const count=Number(x.count==null?10:x.count),totalMarks=Number(x.totalMarks==null?25:x.totalMarks);
 if(!Number.isInteger(count)||count<2||count>50)throw Error('Number of questions/tasks must be between 2 and 50.');
 if(!Number.isInteger(totalMarks)||totalMarks<5||totalMarks>100)throw Error('Total marks must be between 5 and 100.');
 const duration=String(x.duration||'45 Minutes').slice(0,50);
 return {tool,className,subject,topic,language,difficulty,count,totalMarks,duration,food:isFood(subject,topic)};
}
function prompt(q,i){const op=['Define','Compare','Apply','Explain with an example','Find a misconception about','Provide evidence for'];const hi=['परिभाषित करें','तुलना करें','उदाहरण सहित लागू करें','उदाहरण सहित समझाएँ','गलत धारणा पहचानें','प्रमाण दें'];return [op[i%op.length]+' '+q.topic+' using your class notes or textbook.','पाठ्य-पुस्तक से '+q.topic+' पर '+hi[i%hi.length]+'।'];}
function question(q,i){if(q.food){const pair=FOOD_QUESTIONS[i%FOOD_QUESTIONS.length],round=Math.floor(i/FOOD_QUESTIONS.length);if(round===0)return choose(q.language,pair[0],pair[1]);return choose(q.language,'For a different everyday meal: '+pair[0],'अलग भोजन के उदाहरण पर: '+pair[1]);}const p=prompt(q,i);return choose(q.language,p[0],p[1]);}
function assignMarks(n,total){if(total<n)throw Error('Total marks must be at least the number of questions.');const marks=Array(n).fill(1);for(let rem=total-n,i=n-1;rem>0;rem--,i=(i-1+n)%n)marks[i]++;return marks;}
function numbered(q,n,total,mode){const marks=assignMarks(n,total),out=[],answers=[];for(let i=0;i<n;i++){let str=question(q,i);if(q.food&&mode==='paper'&&i<Math.min(5,n)){const m=FOOD_MCQ[i];str=choose(q.language,m[0],m[1]);answers.push('Q'+(i+1)+': '+m[2]);}out.push('Q'+(i+1)+'. '+str+' ['+marks[i]+' '+(marks[i]===1?'mark':'marks')+']');}return {body:out.join('\n\n'),answers:answers.join('; '),sum:marks.reduce((a,b)=>a+b,0)};}
function generate(input){
 const q=parse(input),h=choose(q.language,'TEACHER DRAFT — VERIFY BEFORE USE','शिक्षक ड्राफ्ट — उपयोग से पहले जाँचें');
 const title=q.tool.replace(' Generator',''),head=title+' | '+q.subject+' | '+q.topic+'\n'+choose(q.language,'Class','कक्षा')+': '+q.className+' | '+choose(q.language,'Language','भाषा')+': '+q.language+'\n'+h;
 const scope=q.food?choose(q.language,'Topic-specific content from common school science concepts. Match with your school textbook before publishing.','विषय-वस्तु सामान्य विज्ञान अवधारणाओं पर आधारित है। विद्यालय की पुस्तक से मिलान करें।'):choose(q.language,'Structured offline template only. No textbook or board curriculum was provided; verify facts and add your textbook-specific examples.','यह ऑफलाइन प्रारूप है। पाठ्यपुस्तक/बोर्ड सामग्री उपलब्ध नहीं है; तथ्य और उदाहरण शिक्षक जाँचें।');
 const context=q.food?FACTS.map((p,i)=>(i+1)+'. '+choose(q.language,p[0],p[1])).join('\n') : choose(q.language,'Ask learners to identify 3 verified concepts, 2 examples and 1 misconception from the prescribed textbook.','निर्धारित पुस्तक से 3 अवधारणाएँ, 2 उदाहरण और 1 सामान्य गलतफहमी पहचानें।');
 if(q.tool==='Lesson Plan Generator'){
  const duration=mins(q.duration),parts=[Math.floor(duration*.15),Math.floor(duration*.25),Math.floor(duration*.25),Math.floor(duration*.2)];parts.push(duration-parts.reduce((a,b)=>a+b,0));
  const labels=[['Warm-up / prior knowledge','पूर्वज्ञान'],['Explain verified concepts','अवधारणाओं की व्याख्या'],['Group classification activity','समूह गतिविधि'],['Guided practice','अभ्यास'],['Exit ticket and feedback','मूल्यांकन']];
  const timeline=labels.map((p,i)=>choose(q.language,p[0],p[1])+': '+parts[i]+' min').join('\n');
  return head+'\n\n'+scope+'\n\n'+choose(q.language,'Learning outcomes: classify examples, explain reasons, check misconceptions.','सीखने के लक्ष्य: उदाहरण वर्गीकृत करना, कारण समझाना, गलतफहमियाँ जाँचना।')+'\n\n'+choose(q.language,'KEY CONCEPTS AND EXAMPLES','मुख्य अवधारणाएँ व उदाहरण')+'\n'+context+'\n\n'+choose(q.language,'PERIOD PLAN','समय योजना')+' ('+duration+' min)\n'+timeline+'\n\n'+choose(q.language,'Assessment questions','मूल्यांकन प्रश्न')+':\n'+[0,1,2].map(i=>question(q,i)).join('\n')+'\n\n'+choose(q.language,'Homework: describe your meal and identify at least three nutrient sources, or cite your school textbook.','गृहकार्य: अपने भोजन के तीन पोषक स्रोत बताएं या पुस्तक से उदाहरण दें।');
 }
 if(['Question Paper Generator','Class Test Generator','Worksheet Generator'].includes(q.tool)){
  const rows=numbered(q,q.count,q.totalMarks,q.tool==='Question Paper Generator'?'paper':'practice');
  const instruction=choose(q.language,'Answer every question. Teacher must check syllabus and final answers.','सभी प्रश्न हल करें। शिक्षक पाठ्यक्रम और उत्तर जाँचें।');
  return head+'\n'+scope+'\n\n'+choose(q.language,'Time','समय')+': '+q.duration+' | '+choose(q.language,'Maximum marks','पूर्णांक')+': '+q.totalMarks+' | '+choose(q.language,'Questions','प्रश्न')+': '+q.count+'\n'+instruction+'\n\n'+rows.body+'\n\n'+choose(q.language,'MARKING CHECK','अंक जाँच')+': '+rows.sum+'/'+q.totalMarks+(rows.answers?'\n'+choose(q.language,'MCQ answer key (review)','बहुविकल्प उत्तर (जाँचें)')+': '+rows.answers:'');
 }
 if(q.tool==='Homework Generator'){
  const qs=Array.from({length:Math.min(10,q.count)},(_,i)=>(i+1)+'. '+question(q,i)).join('\n');
  return head+'\n'+scope+'\n\n'+choose(q.language,'Estimated effort','अनुमानित समय')+': '+q.duration+'\n'+choose(q.language,'Revise verified classroom notes, then attempt these tasks:','कक्षा के सत्यापित नोट्स दोहराकर ये कार्य करें:')+'\n'+qs+'\n\n'+choose(q.language,'Teacher: set and confirm due date before publishing; parent acknowledgement is optional.','शिक्षक: साझा करने से पहले जमा तिथि तय करें; अभिभावक हस्ताक्षर वैकल्पिक हैं।');
 }
 if(q.tool==='Student Remark Generator')return head+'\n'+scope+'\n\n'+choose(q.language,'Use only after checking actual marks, attendance and classroom evidence. Choose and edit the correct observation:','असली अंक, उपस्थिति और कक्षा के प्रमाण देखकर ही सही टिप्पणी चुनें:')+'\n'+choose(q.language,'1. Demonstrated [observed strength] in '+q.topic+'. Example: [specific dated work].\n2. Needs more practice with [observed skill]. Next step: [agreed activity].\n3. Improved from [measured baseline] to [latest assessment]. Next review: [date].','1. '+q.topic+' में [देखी गई ताकत] दिखाई। उदाहरण: [दिनांक सहित कार्य]।\n2. [देखा गया कौशल] में अभ्यास जरूरी है। अगला कदम: [कार्य]।\n3. [पहले अंक] से [नए अंक] तक सुधार। अगली समीक्षा: [तिथि]।');
 if(q.tool==='Weak Student Remedial Plan')return head+'\n'+scope+'\n\n'+choose(q.language,'Do not assume a learning disability, low score or knowledge gap without assessment.','आकलन के बिना कमज़ोरी या अंक न मानें।')+'\n'+choose(q.language,'Baseline: [recent evidence / score]\nTarget: [specific attainable goal]\nSessions: '+q.duration+'\nWeek 1: explain one observed difficulty; guided practice with a worked example.\nWeek 2: short checks, feedback and adjustment.\nReview: compare the same skill before/after, share only with authorized guardians.','शुरुआती स्तर: [सत्यापित अंक]\nलक्ष्य: [व्यावहारिक लक्ष्य]\nअवधि: '+q.duration+'\nपहले हफ्ते: उदाहरण और मार्गदर्शन।\nदूसरे हफ्ते: अभ्यास, प्रतिक्रिया, दोबारा जाँच।');
 if(q.tool==='Activity Ideas Generator')return head+'\n'+scope+'\n\n'+Array.from({length:Math.min(8,q.count)},(_,i)=>(i+1)+'. '+choose(q.language,['Classify real examples from home or classroom and explain your choices.','Discuss a short case in pairs and compare evidence from the textbook.','Create a chart or model with teacher-approved safe materials.','Explain a common misconception and correct it using evidence.'][i%4],['घर या कक्षा के उदाहरणों का वर्गीकरण और कारण।','जोड़ों में केस चर्चा और पुस्तक के प्रमाण।','सुरक्षित सामग्री से चार्ट/मॉडल बनाएँ।','गलत धारणा और प्रमाण सहित सुधार।'][i%4])).join('\n')+'\n\n'+choose(q.language,'Teacher checks safety, age suitability and materials before use.','शिक्षक सुरक्षा और सामग्री पहले जाँचें।');
 if(q.tool==='Parent Message Generator')return head+'\n\n'+choose(q.language,'Dear Parent/Guardian,','प्रिय अभिभावक,')+'\n'+choose(q.language,'Proposed learning focus for Class '+q.className+': '+q.subject+' — '+q.topic+'. Please refer to the teacher-confirmed homework and due date in the school portal. Contact the class teacher with questions.','कक्षा '+q.className+' में प्रस्तावित विषय: '+q.subject+' — '+q.topic+'। कृपया स्कूल पोर्टल में शिक्षक से पुष्टि किया गया गृहकार्य और तिथि देखें।')+'\n\n'+choose(q.language,'[Teacher must confirm lesson completion and recipient list before sending.]','[भेजने से पहले शिक्षक पढ़ाई और प्राप्तकर्ता सूची की पुष्टि करें।]');
 if(q.tool==='School Notice Generator')return head+'\n\n'+choose(q.language,'DRAFT CIRCULAR — AWAITING PRINCIPAL APPROVAL','प्रारूप सूचना — प्रधानाचार्य की स्वीकृति शेष')+'\n'+choose(q.language,'Subject','विषय')+': '+q.topic+'\n'+choose(q.language,'Class','कक्षा')+': '+q.className+' | '+choose(q.language,'Date and time','तिथि और समय')+': [CONFIRM]\n'+choose(q.language,'Venue','स्थान')+': [CONFIRM]\n'+choose(q.language,'Purpose and instructions','उद्देश्य और निर्देश')+': [SCHOOL MUST VERIFY]\n\n'+choose(q.language,'No mandatory attendance or event date is asserted until school approval.','विद्यालय की पुष्टि बिना अनिवार्य उपस्थिति या तिथि घोषित न करें।');
 throw Error('This generator is not available.');
}
function printDraft(text,openWindow){
 const content=String(text==null?'':text).trim();
 if(!content)throw Error('Nothing to print.');
 const opener=openWindow||(typeof window!=='undefined'&&window.open&&window.open.bind(window));
 if(typeof opener!=='function')throw Error('Print preview unavailable in this browser.');
 const win=opener('','_blank','width=900,height=750');
 if(!win||!win.document)throw Error('Pop-up blocked. Allow print pop-ups and retry.');
 const d=win.document;d.title='Bright Nexa · Teacher Draft';
 const style=d.createElement('style');
 style.textContent='@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 monospace}';
 const heading=d.createElement('h1');heading.textContent='Bright Nexa · Teacher-reviewed draft';
 const pre=d.createElement('pre');pre.textContent=content;
 d.head.appendChild(style);d.body.appendChild(heading);d.body.appendChild(pre);
 win.focus();win.print();return true;
}
return {TOOLS,generate,parse,assignMarks,printDraft};
});