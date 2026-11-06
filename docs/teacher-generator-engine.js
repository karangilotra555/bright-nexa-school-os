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
function mins(s){const t=String(s||'45 Minutes').toLowerCase();if(/double period/.test(t))return 80;const h=t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/),m=t.match(/(\d+)\s*(?:minutes?|mins?)/);if(h)return (Number(h[1])*60)+(m?+m[1]:0);if(m)return +m[1];const n=t.match(/\d+/);return n?+n[0]:45;}
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

// Board-agnostic mark bands (1 objective, 2-3 short, 4 long, 5 case).
// A board-specific blueprint must be supplied and approved by the school;
// do not misrepresent these mark bands as a mandated CBSE scheme.
const PAPER_BANK={
 Easy:{
  mcq:FOOD_MCQ.concat([
   ['Which is an example of a body-building food? (A) Sugar (B) Lentils (C) Salt (D) Water','शरीर बनाने में सहायक भोजन कौन-सा है? (A) चीनी (B) दाल (C) नमक (D) पानी','B'],
   ['Which is a source of roughage? (A) Ghee (B) Sugar (C) Vegetables (D) Oil','आहारीय रेशा किसमें मिलता है? (A) घी (B) चीनी (C) सब्जियाँ (D) तेल','C'],
   ['Which food mainly provides fat? (A) Guava (B) Salt (C) Water (D) Groundnuts','कौन-सा भोजन मुख्यतः वसा देता है? (A) अमरूद (B) नमक (C) पानी (D) मूँगफली','D']
  ]),
  short:[
   ['Name two food sources of carbohydrates.','कार्बोहाइड्रेट के दो खाद्य स्रोत लिखिए।'],
   ['Name two protein-rich foods.','प्रोटीन वाले दो खाद्य पदार्थ लिखिए।'],
   ['State two functions of water in the body.','शरीर में पानी के दो कार्य बताइए।'],
   ['List three foods that provide different vitamins or minerals.','विभिन्न विटामिन या खनिज देने वाले तीन खाद्य पदार्थ लिखिए।'],
   ['Name three foods containing dietary fibre.','आहारीय रेशा वाले तीन खाद्य पदार्थ लिखिए।'],
   ['Name two common foods containing fats.','वसा वाले दो सामान्य खाद्य पदार्थ लिखिए।'],
   ['List three major nutrient groups found in food.','भोजन के तीन मुख्य पोषक समूह लिखिए।'],
   ['Name two foods useful for a growing child and the nutrients they supply.','बढ़ते बच्चे के लिए दो भोजन और उनके पोषक तत्व लिखिए।'],
   ['Write three examples of foods belonging to different food groups.','अलग खाद्य समूहों से तीन भोजनों के उदाहरण लिखिए।'],
   ['State the main role of carbohydrates and name two sources.','कार्बोहाइड्रेट का मुख्य काम और दो स्रोत लिखिए।']
  ],
  long:[
   ['List four nutrient groups and give one food source for each.','चार पोषक समूह और प्रत्येक का एक स्रोत लिखिए।'],
   ['Describe four components of a balanced diet in simple terms.','संतुलित आहार के चार घटक सरल शब्दों में बताइए।'],
   ['Identify four foods from a daily meal and state their main nutrient contributions.','दैनिक भोजन की चार वस्तुओं के प्रमुख पोषक तत्व बताइए।'],
   ['State four reasons why water, vegetables and a variety of foods matter.','पानी, सब्जियाँ और विविध भोजन के महत्व के चार कारण लिखिए।']
  ],
  case:[
   ['A lunch box contains rice, dal, curd, vegetables and water. Identify five food contributions from this meal.','टिफिन में चावल, दाल, दही, सब्जी और पानी है। इस भोजन के पाँच पोषक योगदान बताइए।'],
   ['A market basket contains whole wheat, lentils, spinach, peanuts and oranges. Identify the chief nutrient contribution of each.','बाजार की टोकरी में गेहूँ, दाल, पालक, मूँगफली और संतरे हैं। प्रत्येक का प्रमुख पोषक योगदान बताइए।'],
   ['A pupil lists water, fruits, cereals, pulses and oils. State one useful function of each food group.','एक विद्यार्थी ने पानी, फल, अनाज, दाल और तेल गिनाए हैं। प्रत्येक समूह का एक उपयोग लिखिए।']
  ]
 },
 Medium:{
  mcq:[
   ['A child needs a protein-rich addition to rice. Which is most suitable? (A) Sugar (B) Dal (C) Salt (D) Oil','चावल के साथ प्रोटीन बढ़ाने के लिए क्या चुनेंगे? (A) चीनी (B) दाल (C) नमक (D) तेल','B'],
   ['Which meal has greater nutrient variety? (A) Only rice (B) Only chips (C) Rice, dal and vegetables (D) Only sweets','किस भोजन में पोषक विविधता अधिक है? (A) केवल चावल (B) केवल चिप्स (C) चावल, दाल और सब्जी (D) केवल मिठाई','C'],
   ['Iodine turns a potato sample blue-black. What does this show? (A) Starch (B) Protein (C) Fat (D) Vitamin C','आयोडीन से आलू नीला-काला हुआ। यह किसकी उपस्थिति बताता है? (A) स्टार्च (B) प्रोटीन (C) वसा (D) विटामिन C','A'],
   ['Which replacement adds more dietary fibre to refined flour snacks? (A) Oil (B) Salt (C) Sugar (D) Whole grains','मैदे के स्नैक्स में रेशा बढ़ाने के लिए क्या बदलेंगे? (A) तेल (B) नमक (C) चीनी (D) साबुत अनाज','D'],
   ['An athlete sweats heavily after exercise. What should be restored first? (A) Only fats (B) Water (C) Only sugar (D) Only salt','व्यायाम के बाद बहुत पसीना आया। पहले किसकी पूर्ति जरूरी है? (A) केवल वसा (B) पानी (C) केवल चीनी (D) केवल नमक','B']
  ],
  short:[
   ['Compare two meals, rice alone and rice with dal, for their protein contribution.','केवल चावल और दाल के साथ चावल की प्रोटीन मात्रा की तुलना कीजिए।'],
   ['Explain why adding a vegetable makes a cereal-based meal more varied.','अनाज आधारित भोजन में सब्जी जोड़ने से विविधता क्यों बढ़ती है?'],
   ['Apply the idea of food groups to suggest two improvements to a fried-snack lunch.','तले स्नैक्स वाले दोपहर के भोजन में खाद्य समूहों के आधार पर दो सुधार सुझाइए।'],
   ['Explain how whole grains and refined sugar differ as sources of roughage.','साबुत अनाज और चीनी में रेशे के स्रोत के रूप में अंतर समझाइए।'],
   ['Use the iodine test observation to explain why a food sample is considered starch-containing.','आयोडीन परीक्षण के परिणाम से भोजन में स्टार्च होने का कारण समझाइए।'],
   ['Compare the principal roles of proteins and carbohydrates in a growing child.','बढ़ते बच्चे में प्रोटीन और कार्बोहाइड्रेट के मुख्य कार्यों की तुलना कीजिए।'],
   ['Suggest three food changes that would improve nutrient variety in a breakfast of only sweets.','केवल मिठाई वाले नाश्ते में पोषण विविधता बढ़ाने के तीन बदलाव सुझाइए।'],
   ['Explain why drinking water alone cannot replace a balanced meal.','केवल पानी पीना संतुलित भोजन का विकल्प क्यों नहीं है?'],
   ['Classify rice, dal and peanuts into their primary nutrient groups.','चावल, दाल और मूँगफली को उनके प्रमुख पोषक समूहों में बाँटिए।'],
   ['Explain how a fruit and a pulse complement an energy-rich rice meal.','फल और दाल ऊर्जा-प्रधान चावल के भोजन को कैसे संतुलित करते हैं?']
  ],
  long:[
   ['Analyse a lunch consisting only of noodles and soft drinks; recommend four practical nutrient additions.','केवल नूडल्स और ठंडे पेय वाले भोजन का विश्लेषण कर चार पौष्टिक सुधार सुझाइए।'],
   ['Compare the likely nutrient contributions of rice, dal, vegetables and groundnuts with reasons.','चावल, दाल, सब्जी और मूँगफली के पोषक योगदानों की कारण सहित तुलना कीजिए।'],
   ['Analyse how roughage, water, vitamins and proteins contribute differently to a daily diet.','आहार में रेशा, पानी, विटामिन और प्रोटीन की अलग भूमिकाओं का विश्लेषण कीजिए।'],
   ['Use food-test observations and food labels to classify sources of starch and fat.','भोजन परीक्षण तथा लेबल के आधार पर स्टार्च और वसा के स्रोतों का वर्गीकरण कीजिए।']
  ],
  case:[
   ['A student eats rice, chips and a sweet drink daily. Propose five specific replacements or additions and explain their roles.','एक विद्यार्थी रोज चावल, चिप्स और मीठा पेय लेता है। पाँच बदलाव और उनके पोषक कारण दीजिए।'],
   ['Two breakfast menus are: A, sweet tea and biscuits; B, roti, dal, fruit and water. Compare their food-group coverage in five points.','दो नाश्ते हैं: A, मीठी चाय-बिस्कुट; B, रोटी, दाल, फल और पानी। पाँच बिंदुओं में पोषण की तुलना कीजिए।'],
   ['A sample gives a blue-black iodine test and an oily paper spot. Infer the nutrient groups and describe a balanced food pairing in five points.','नमूने में आयोडीन नीला-काला हुआ और कागज पर तेल का निशान दिखा। पोषक समूह और संतुलित भोजन के पाँच बिंदु लिखिए।']
  ]
 },
 Hard:{
  mcq:[
   ['A food advertisement says a product with starch alone is a complete diet. Which assessment is best? (A) True for all children (B) Fats are unnecessary (C) Other nutrients are also required (D) Water is optional','विज्ञापन कहता है केवल स्टार्च वाला भोजन पूर्ण आहार है। सही मूल्यांकन? (A) हमेशा सही (B) वसा बेकार (C) अन्य पोषक भी जरूरी (D) पानी वैकल्पिक','C'],
   ['Two meals supply similar calories, but one lacks vegetables. Which conclusion is justified? (A) Equal calories guarantee equal nutrition (B) Vitamin and fibre supply may differ (C) Vegetables supply no nutrients (D) Only sugar matters','दो भोजन समान ऊर्जा देते हैं, लेकिन एक में सब्जियाँ नहीं हैं। सही निष्कर्ष? (A) समान ऊर्जा मतलब समान पोषण (B) विटामिन-रेशे अलग हो सकते हैं (C) सब्जियाँ बेकार (D) केवल चीनी जरूरी','B'],
   ['A blue-black iodine result proves which claim? (A) The entire meal is balanced (B) Protein is absent (C) Water is unsafe (D) Starch is present','आयोडीन का नीला-काला परिणाम किस दावे को साबित करता है? (A) पूरा भोजन संतुलित है (B) प्रोटीन नहीं है (C) पानी अशुद्ध है (D) स्टार्च मौजूद है','D'],
   ['A plan removes all dietary fat despite varied foods. Which evaluation is strongest? (A) The plan may omit essential energy-rich nutrients (B) It is always healthiest (C) Protein replaces all fat functions (D) Water contains fat','विविध भोजन के बावजूद सारी वसा हटा दी गई। सर्वोत्तम मूल्यांकन? (A) आवश्यक वसा और ऊर्जा की कमी हो सकती है (B) हमेशा अच्छा (C) प्रोटीन सभी वसा का विकल्प (D) पानी में वसा है','A'],
   ['A pupil concludes that a food with protein needs no other nutrients. Which objection is sound? (A) Proteins are never useful (B) Other nutrient groups serve distinct functions (C) Water is a carbohydrate (D) Minerals are only fats','विद्यार्थी कहता है प्रोटीन वाले भोजन में अन्य पोषक नहीं चाहिए। सही आपत्ति? (A) प्रोटीन बेकार (B) अन्य पोषकों के अलग कार्य हैं (C) पानी कार्बोहाइड्रेट है (D) खनिज ही वसा हैं','B']
  ],
  short:[
   ['Evaluate the claim that any energy-rich meal must be nutritionally balanced. Give two reasons.','दावे का मूल्यांकन कीजिए कि ऊर्जा देने वाला हर भोजन संतुलित होता है। दो कारण दीजिए।'],
   ['Explain why an iodine test alone cannot establish the nutritional completeness of a food.','केवल आयोडीन परीक्षण से भोजन का पूरा पोषण क्यों नहीं पता चल सकता?'],
   ['Assess two weaknesses in a meal containing only refined flour and sugary drinks.','केवल मैदा और मीठे पेय वाले भोजन की दो पोषण कमियाँ बताइए।'],
   ['Justify why two meals of equal size may offer very different nutrient benefits.','समान मात्रा वाले दो भोजनों का पोषण अलग क्यों हो सकता है? कारण दीजिए।'],
   ['Evaluate the claim that adding water compensates for the absence of proteins in meals.','दावे का मूल्यांकन कीजिए कि पानी पीना भोजन में प्रोटीन की कमी पूरी कर देता है।'],
   ['Construct a two-step method to compare fibre sources in everyday foods and justify it.','दैनिक भोजनों में रेशे के स्रोतों की तुलना की दो-चरणीय विधि और कारण बताइए।'],
   ['Critique the idea that fat-rich food alone meets all the needs of a growing child.','इस विचार की आलोचना कीजिए कि वसा-प्रधान भोजन बढ़ते बच्चे की सभी जरूरतें पूरी करता है।'],
   ['Suggest and defend two changes to make a snack-only food diary more balanced.','केवल स्नैक्स वाली आहार डायरी संतुलित बनाने के दो परिवर्तन और कारण दीजिए।'],
   ['Evaluate whether drinking fruit juice alone provides a complete breakfast; justify your conclusion.','मूल्यांकन कीजिए कि क्या केवल फलों का रस पूरा नाश्ता है; कारण दीजिए।'],
   ['Design two checks to determine whether a proposed lunch provides both protein and fibre.','प्रस्तावित भोजन में प्रोटीन और रेशा जाँचने के दो तरीके सुझाइए।']
  ],
  long:[
   ['Design a four-point assessment rubric for a balanced school lunch, defending the nutritional role of each criterion.','संतुलित स्कूल भोजन के लिए चार-बिंदु मूल्यांकन मापदंड बनाएँ और प्रत्येक का पोषण तर्क दें।'],
   ['Critically evaluate a food label advertising starch and fat as a complete set of nutrients; propose four corrections.','स्टार्च और वसा को पूर्ण पोषण बताने वाले लेबल की आलोचनात्मक समीक्षा कर चार सुधार दीजिए।'],
   ['Develop a method to compare two breakfast menus for energy, growth, fibre and hydration, with reasons.','ऊर्जा, वृद्धि, रेशा और जल के आधार पर दो नाश्तों की तुलना की विधि कारण सहित बनाएँ।'],
   ['Evaluate two food-test observations and explain four limits of inferring overall diet quality from them.','दो खाद्य परीक्षणों का मूल्यांकन कीजिए और उनसे पूरे आहार का स्तर समझने की चार सीमाएँ बताइए।']
  ],
  case:FOOD_EXTENDED_QUESTIONS
 }
};
function markDistribution(count,total,allowed){
 const active=allowed.filter(m=>m<=total),minEach=count>=active.length?1:0;
 let best=null;
 function search(i,leftCount,leftMarks,counts){
  if(i===active.length){
   if(leftCount||leftMarks)return;
   const diversity=counts.filter(n=>n>0).length;
   // Spread question weights across sections without claiming a board mandate.
   const score=counts.reduce((sum,n)=>sum+(n-count/active.length)**2,0)-diversity*.2;
   if(!best||score<best.score)best={score,counts:[...counts]};
   return;
  }
  const m=active[i],later=active.length-i-1;
  for(let n=minEach;n<=leftCount-later*minEach;n++){
   const remCount=leftCount-n,remMarks=leftMarks-n*m;
   if(remMarks<0)break;
   const rest=active.slice(i+1);
   if(rest.length&&(remMarks<remCount*rest[0]||remMarks>remCount*rest[rest.length-1]))continue;
   search(i+1,remCount,remMarks,[...counts,n]);
  }
 }
 search(0,count,total,[]);
 if(!best)throw Error('No feasible mark distribution for this question count, time limit and total marks. Choose fewer marks or more questions.');
 return active.flatMap((m,i)=>Array(best.counts[i]).fill(m));
}
function buildPaper(input){
 const q=parse({...input,tool:'Question Paper Generator'});
 if(!q.food)throw Error('No verified question bank for this chapter. Add a school-approved question bank before publishing.');
 const duration=mins(q.duration);
 if(!Number.isFinite(duration)||duration<30||duration>180)throw Error('Duration must be between 30 and 180 minutes.');
 // The school may configure a different official board pattern in the future.
 const allowed=duration<=60?[1,2,3]:duration<150?[1,2,3,4]:[1,2,3,4,5];
 if(q.totalMarks>Math.floor(duration/1.2))throw Error('Total marks exceed feasible time allocation for this duration. Increase time or reduce marks.');
 if(q.totalMarks<q.count)throw Error('Total marks must be at least the number of questions.');
 const marks=markDistribution(q.count,q.totalMarks,allowed);
 const slots=Object.entries(marks.reduce((map,m)=>{(map[m]||(map[m]=[])).push(m);return map;},{}))
   .flatMap(([m,items])=>items.map(()=>Number(m)));
 const sections=[],questions=[];
 const used=new Set();
 const configs=[
  {kind:'Objective',type:'MCQ',values:[1],labelHi:'वस्तुनिष्ठ प्रश्न'},
  {kind:'Short Answer',type:'Short Answer',values:[2,3],labelHi:'लघु उत्तरीय प्रश्न'},
  {kind:'Long Answer',type:'Long Answer',values:[4],labelHi:'दीर्घ उत्तरीय प्रश्न'},
  {kind:'Case Study',type:'Case Study',values:[5],labelHi:'परिस्थिति आधारित प्रश्न'}
 ];
 const bank=PAPER_BANK[q.difficulty],selectionOffset=[45,60,90,120,150,180].indexOf(duration);
 for(const config of configs){
  const current=slots.filter(m=>config.values.includes(m));if(!current.length)continue;
  const entries=[],pool=bank[config.type==='MCQ'?'mcq':config.type==='Short Answer'?'short':config.type==='Long Answer'?'long':'case'];
  for(let j=0;j<current.length;j++){
   const marks=current[j];
   let chosen=null;
   for(let x=0;x<pool.length;x++){
    const candidate=pool[(j+x+Math.max(0,selectionOffset))%pool.length],key=candidate[0].trim().toLowerCase();
    if(!used.has(key)){chosen=candidate;used.add(key);break}
   }
   if(!chosen)throw Error('Verified question pool exhausted. Reduce question count or add reviewed chapter questions.');
   const pair=config.type==='MCQ'?chosen.slice(0,2):chosen;
   const bloom=q.difficulty==='Easy'?(marks===1?'Remember':'Understand'):q.difficulty==='Medium'?(marks<=2?'Apply':'Analyze'):(marks<=2?'Evaluate':'Create');
   const row={id:'Q'+(questions.length+1),type:config.type,bloom,marks,en:pair[0],hi:pair[1],minutes:1};
   if(config.type==='MCQ')row.answer=chosen[2];
   questions.push(row);entries.push(row);
  }
  sections.push({kind:config.kind,hi:config.labelHi,questions:entries,marks:entries.reduce((s,item)=>s+item.marks,0)});
 }
 // Allocate the exact duration using largest-remainder apportionment.
 const weights=questions.map(item=>item.marks*(item.type==='MCQ'?.65:item.type==='Case Study'?1.35:1));
 const remaining=duration-questions.length,totalWeight=weights.reduce((s,x)=>s+x,0);
 const extras=weights.map(w=>remaining*w/totalWeight),floor=extras.map(Math.floor);
 let residue=remaining-floor.reduce((s,n)=>s+n,0);
 const ranking=extras.map((x,i)=>({i,r:x-floor[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
 for(let i=0;i<residue;i++)floor[ranking[i].i]++;
 questions.forEach((item,i)=>item.minutes+=floor[i]);
 return {subject:q.subject,topic:q.topic,className:q.className,difficulty:q.difficulty,language:q.language,durationMinutes:duration,totalMarks:q.totalMarks,questionCount:q.count,sections};
}


function paperNumbered(q){
 const p=buildPaper(q), lines=[],answers=[];
 for(const section of p.sections){
  lines.push(choose(q.language,'SECTION — '+section.kind, 'अनुभाग — '+section.hi)+' ('+section.marks+' '+(section.marks===1?'mark':'marks')+')');
  for(const item of section.questions){
   lines.push(item.id+'. '+choose(q.language,item.en,item.hi)+' ['+item.marks+' '+(item.marks===1?'mark':'marks')+']');
   lines.push(choose(q.language,'Suggested time','प्रस्तावित समय')+': '+item.minutes+' min');
   if(item.answer)answers.push(item.id+': '+item.answer);
  }
 }
 return {body:lines.join('\n\n'),answers:answers.join('; '),sum:p.totalMarks,description:choose(q.language,
 'Question types and marks are aligned to the selected duration; this is a teacher-reviewed, board-agnostic blueprint.',
 'प्रश्न प्रकार तथा अंक चुनी हुई अवधि के अनुसार हैं; यह शिक्षक द्वारा जाँचा जाने वाला प्रारूप है, बोर्ड का आधिकारिक प्रारूप नहीं।')};
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
  const rows=paperNumbered(q);
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
return {TOOLS,generate,buildPaper,parse,assignMarks,printDraft};
});