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
function mins(s){const t=String(s||'45 Minutes').toLowerCase();if(/double period/.test(t))return 80;const h=t.match(/(\d+)\s*(?:hours?|hrs?)/),m=t.match(/(\d+)\s*(?:minutes?|mins?)/);if(h)return (+h[1]*60)+(m?+m[1]:0);if(m)return +m[1];const n=t.match(/\d+/);return n?+n[0]:45;}
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

/*
 * A genuine timed paper needs different question structures, not merely a
 * different time label. This is a small verified chapter bank, NOT an AI.
 * Refuse chapters without a reviewed bank rather than fabricating a paper.
 */
const FOOD_QUICK_GROUPS=[
 [
  ['Name one carbohydrate-rich food.','कार्बोहाइड्रेट वाला एक भोजन लिखिए।'],
  ['What is the main function of carbohydrates?','कार्बोहाइड्रेट का मुख्य कार्य क्या है?'],
  ['Name a cereal commonly eaten in India.','भारत में खाया जाने वाला एक अनाज लिखिए।'],
  ['Identify the main nutrient in rice.','चावल में मुख्य पोषक तत्व बताइए।'],
  ['Name a food made from wheat.','गेहूँ से बनी एक खाद्य वस्तु बताइए।']
 ],
 [
  ['Name one protein-rich pulse.','प्रोटीन वाली एक दाल लिखिए।'],
  ['State one role of proteins in the body.','शरीर में प्रोटीन का एक काम बताइए।'],
  ['Name one animal-derived protein food.','प्रोटीन वाला एक पशु-आधारित भोजन लिखिए।'],
  ['Which nutrient helps repair body tissues?','शरीर के ऊतक सुधारने में कौन सा पोषक तत्व मदद करता है?'],
  ['Name one plant-derived protein food.','प्रोटीन वाला एक पौधों से मिलने वाला भोजन लिखिए।']
 ],
 [
  ['Name a food that provides fats.','वसा देने वाला एक भोजन बताइए।'],
  ['State one function of dietary fat.','आहार की वसा का एक कार्य बताइए।'],
  ['Name an edible cooking oil.','खाने में प्रयुक्त एक तेल का नाम लिखिए।'],
  ['Which nutrient supplies concentrated energy?','कौन सा पोषक तत्व सघन ऊर्जा देता है?'],
  ['Name one fat-containing seed or nut.','वसा वाला एक बीज या मेवा लिखिए।']
 ],
 [
  ['Name one fruit providing vitamins.','विटामिन वाला एक फल लिखिए।'],
  ['Name a leafy green vegetable.','एक पत्तेदार हरी सब्जी का नाम लिखिए।'],
  ['Which nutrient category includes vitamin C?','विटामिन C किस पोषक श्रेणी में आता है?'],
  ['Name one food source of vitamin A.','विटामिन A वाला एक भोजन लिखिए।'],
  ['State why different vegetables are useful in a diet.','आहार में अलग-अलग सब्जियाँ क्यों उपयोगी हैं?']
 ],
 [
  ['Name a calcium-rich food.','कैल्शियम वाला एक भोजन लिखिए।'],
  ['Name a mineral needed for healthy bones.','हड्डियों के लिए जरूरी एक खनिज लिखिए।'],
  ['Which mineral is commonly associated with haemoglobin?','हीमोग्लोबिन से संबंधित खनिज कौन सा है?'],
  ['Name a food that can provide iron.','लौह प्रदान करने वाला एक भोजन लिखिए।'],
  ['State one function of calcium in the body.','शरीर में कैल्शियम का एक कार्य लिखिए।']
 ],
 [
  ['Name a source of dietary fibre.','आहारीय रेशे का एक स्रोत लिखिए।'],
  ['State one benefit of roughage.','रेशे का एक लाभ लिखिए।'],
  ['Are whole grains or refined sugar a better fibre source?','साबुत अनाज और चीनी में किसमें अधिक रेशा होता है?'],
  ['Name one fruit that contains fibre.','रेशे वाला एक फल लिखिए।'],
  ['Name a fibre-rich vegetable.','रेशे वाली एक सब्जी लिखिए।']
 ],
 [
  ['State one function of water in the body.','शरीर में पानी का एक काम लिखिए।'],
  ['Name one way the body loses water.','शरीर से पानी निकलने का एक तरीका लिखिए।'],
  ['What should you drink after heavy sweating?','बहुत पसीना आने पर क्या पीना चाहिए?'],
  ['Does plain water supply carbohydrates?','क्या साधारण पानी कार्बोहाइड्रेट देता है?'],
  ['Name one food with high water content.','अधिक पानी वाला एक भोजन लिखिए।']
 ],
 [
  ['What is meant by a balanced diet?','संतुलित आहार का अर्थ लिखिए।'],
  ['Name one factor that affects dietary needs.','आहार की जरूरत बदलने वाला एक कारण लिखिए।'],
  ['Why should meals contain different food groups?','भोजन में अलग-अलग खाद्य समूह क्यों हों?'],
  ['Which is more varied: rice alone or rice with dal and vegetables?','केवल चावल या दाल-सब्जी के साथ चावल में कौन ज्यादा विविध है?'],
  ['Name one food group often missing from a snack-only diet.','केवल स्नैक्स खाने से छूट सकने वाला एक खाद्य समूह लिखिए।']
 ],
 [
  ['What substance is detected by the iodine test in food?','आयोडीन परीक्षण से भोजन में क्या पता चलता है?'],
  ['What colour indicates starch with iodine?','आयोडीन से स्टार्च होने पर कौन सा रंग बनता है?'],
  ['What kind of mark may indicate fats in a paper test?','कागज परीक्षण में वसा का कौन सा निशान दिख सकता है?'],
  ['Why use a small sample for food tests?','खाद्य परीक्षण में छोटा नमूना क्यों लें?'],
  ['Why should food tests be performed under teacher supervision?','खाद्य परीक्षण शिक्षक की निगरानी में क्यों हों?']
 ],
 [
  ['A child eats only plain rice: name one nutrient group to add.','बच्चा केवल चावल खाता है: एक और पोषक समूह बताइए।'],
  ['Name a protein-rich addition to a rice meal.','चावल के साथ प्रोटीन वाला एक भोजन बताइए।'],
  ['Suggest one vegetable to add to a plain meal.','साधारण भोजन में जोड़ने के लिए एक सब्जी बताइए।'],
  ['Why is eating only oily snacks not a balanced diet?','केवल तले स्नैक्स संतुलित आहार क्यों नहीं हैं?'],
  ['State one advantage of choosing seasonal fruits.','मौसमी फल चुनने का एक लाभ बताइए।']
 ],
 [
  ['A person feels thirsty after sports: which essential substance is needed?','खेल के बाद प्यास लगे तो कौन सा आवश्यक पदार्थ चाहिए?'],
  ['A growing child needs tissue repair: which nutrient is important?','बढ़ते बच्चे के ऊतक सुधारने के लिए कौन सा पोषक तत्व जरूरी है?'],
  ['A meal has only fats and starch: name one missing nutrient group.','भोजन में केवल वसा और स्टार्च हैं: एक छूटा पोषक समूह बताइए।'],
  ['Name one breakfast food providing fibre.','रेशा देने वाला एक नाश्ते का भोजन बताइए।'],
  ['Name one reason to drink safe water.','स्वच्छ पानी पीने का एक कारण बताइए।']
 ],
 [
  ['A student rejects vegetables: name one nutrient they may miss.','विद्यार्थी सब्जियाँ नहीं खाता: एक संभावित छूटा पोषक तत्व बताइए।'],
  ['Suggest one alternative source of protein for a vegetarian.','शाकाहारी के लिए प्रोटीन का एक अन्य स्रोत बताइए।'],
  ['Give one example of an energy-giving food.','ऊर्जा देने वाले भोजन का एक उदाहरण लिखिए।'],
  ['Give one example of a body-building food.','शरीर-विकास में सहायक भोजन का एक उदाहरण लिखिए।'],
  ['Give one example of a protective food.','सुरक्षात्मक भोजन का एक उदाहरण लिखिए।']
 ]
];
const FOOD_EXTENDED_QUESTIONS=[
 ['Plan a balanced lunch for a classmate and explain the nutritional purpose of each chosen food.','सहपाठी के लिए संतुलित दोपहर का भोजन बनाएँ और हर भोजन का पोषण कारण लिखें।'],
 ['A child eats only rice, fried chips and sweets. Identify nutritional gaps and propose a better daily meal.','बच्चा केवल चावल, चिप्स और मिठाई खाता है। पोषण की कमी और बेहतर भोजन सुझाइए।'],
 ['Compare the roles of carbohydrates, proteins and fats and illustrate each with a daily-life food.','कार्बोहाइड्रेट, प्रोटीन और वसा की तुलना कर प्रत्येक का खाद्य उदाहरण दीजिए।'],
 ['Explain the importance of roughage and water using an example of two contrasting meals.','दो अलग भोजनों के उदाहरण से रेशे और पानी का महत्व समझाइए।'],
 ['You are checking a food sample for starch. Describe the iodine test, expected observation and safety precautions.','खाने में स्टार्च की जाँच के लिए आयोडीन परीक्षण, परिणाम और सुरक्षा सावधानियाँ बताइए।'],
 ['Design a simple comparison of two breakfast menus for nutrients, fibre and variety, giving reasons for your choice.','दो नाश्ते की पोषक तत्व, रेशा और विविधता के आधार पर तुलना कर कारण दीजिए।'],
 ['Explain why children of different ages or activity levels may need different combinations of foods.','अलग उम्र या गतिविधि वाले बच्चों की भोजन आवश्यकताएँ अलग क्यों हो सकती हैं?'],
 ['A friend says vitamins alone provide all the energy we need. Explain the mistake with suitable nutrient examples.','एक मित्र कहता है कि विटामिन ही सारी ऊर्जा देते हैं। पोषक उदाहरण देकर गलती समझाइए।'],
 ['Classify rice, dal, milk, vegetable oil and guava by major nutritional contributions and explain any overlaps.','चावल, दाल, दूध, तेल और अमरूद के प्रमुख पोषक तत्व व कुछ समानताएँ समझाइए।'],
 ['Evaluate a food diary containing only packaged snacks for one day and suggest practical improvements.','एक दिन की केवल पैकेट स्नैक्स वाली भोजन डायरी का मूल्यांकन कर सुधार बताइए।'],
 ['Describe how you would investigate fats in foods using paper and explain what a translucent spot indicates.','कागज से भोजन में वसा की जाँच और पारदर्शी निशान का अर्थ बताइए।'],
 ['Create a nutritious one-day food plan for an active school student and justify its balance and variety.','सक्रिय विद्यार्थी के लिए एक दिन का पौष्टिक भोजन तैयार कर संतुलन और विविधता का कारण दीजिए।']
];
function paperNumbered(q){
 if(!q.food)throw Error('No verified question bank for this chapter. Add a school-approved chapter question bank before generating a question paper.');
 const time=mins(q.duration), marks=assignMarks(q.count,q.totalMarks);
 if(q.count>FOOD_QUICK_GROUPS.length)throw Error('Only 12 distinct reviewed Food Components questions are available. Reduce question count or add a verified school question bank.');
 if(time<15||time>300)throw Error('Paper duration must be between 15 minutes and 5 hours.');
 if(Math.max(...marks)>10)throw Error('This chapter supports at most 10 marks per question. Increase question count or reduce total marks.');
 const mode=time<=60?'quick':time>=150?'extended':'standard';
 if(mode==='quick'&&Math.max(...marks)>5)throw Error('For a short paper, use at most 5 marks per question. Increase questions, reduce marks or extend time.');
 const order=q.difficulty==='Hard'
   ? Array.from({length:12},(_,i)=>11-i)
   : q.difficulty==='Medium'
     ? Array.from({length:12},(_,i)=>(i+2)%12)
     : Array.from({length:12},(_,i)=>i);
 const out=[];
 for(let i=0;i<q.count;i++){
   const mark=marks[i],k=order[i];
   let stem;
   if(mode==='quick'){
     const parts=FOOD_QUICK_GROUPS[k].slice(0,mark).map((part,j)=>'('+String.fromCharCode(97+j)+') '+choose(q.language,part[0],part[1]));
     stem=choose(q.language,'Answer each part (1 mark each): ','प्रत्येक भाग का उत्तर दें (प्रत्येक 1 अंक): ')+parts.join('; ');
   }else if(mode==='extended'){
     const prompt=FOOD_EXTENDED_QUESTIONS[k];
     stem=choose(q.language,prompt[0],prompt[1]);
     if(mark>=4)stem+=' '+choose(q.language,'Give reasons and relevant examples.','कारण तथा उचित उदाहरण दीजिए।');
   }else{
     const pair=FOOD_QUESTIONS[k];
     stem=choose(q.language,pair[0],pair[1]);
     if(mark>=4)stem+=' '+choose(q.language,'Support your answer with reasons and examples.','उत्तर में कारण और उदाहरण दीजिए।');
   }
   out.push('Q'+(i+1)+'. '+stem+' ['+mark+' '+(mark===1?'mark':'marks')+']');
 }
 const descriptions={
   quick:choose(q.language,'Short-answer, one-mark subparts designed for the selected short time limit.','चुनी गई छोटी अवधि के लिए एक-एक अंक के लघु प्रश्न।'),
   standard:choose(q.language,'Conceptual questions with examples and explanations.','अवधारणात्मक प्रश्न, उदाहरण और व्याख्या।'),
   extended:choose(q.language,'Longer reasoning, comparison and case-based questions.','तर्क, तुलना और परिस्थितियों पर आधारित विस्तृत प्रश्न।')
 };
 return {body:out.join('\n\n'),answers:'',sum:marks.reduce((a,b)=>a+b,0),description:descriptions[mode]};
}

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
  const rows=q.tool==='Question Paper Generator'?paperNumbered(q):numbered(q,q.count,q.totalMarks,'practice');
  const instruction=choose(q.language,'Answer every question. Teacher must check syllabus and final answers.','सभी प्रश्न हल करें। शिक्षक पाठ्यक्रम और उत्तर जाँचें।');
  return head+'\n'+scope+'\n\n'+(rows.description?rows.description+'\n\n':'')+choose(q.language,'Time','समय')+': '+q.duration+' | '+choose(q.language,'Maximum marks','पूर्णांक')+': '+q.totalMarks+' | '+choose(q.language,'Questions','प्रश्न')+': '+q.count+'\n'+instruction+'\n\n'+rows.body+'\n\n'+choose(q.language,'MARKING CHECK','अंक जाँच')+': '+rows.sum+'/'+q.totalMarks+(rows.answers?'\n'+choose(q.language,'MCQ answer key (review)','बहुविकल्प उत्तर (जाँचें)')+': '+rows.answers:'');
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