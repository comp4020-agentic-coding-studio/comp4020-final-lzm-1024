// Small optional suggestions, based on the universities' campus directories.
// Free text stays available: selecting a suggestion is not a room booking.
export const campusDetails = {
  anu: { logo:{src:'/logos/anu.svg',width:149,height:52}, locations:['Kambri','Hancock Library','Chifley Library','ANU Sport'], mapUrl:'https://www.anu.edu.au/maps', style:'campus-anu' },
  usyd: { logo:{src:'/logos/usyd.svg',width:168,height:64}, locations:['Fisher Library','The Great Hall','The Quadrangle','Eastern Avenue'], mapUrl:'https://www.sydney.edu.au/about-us/campuses/campus-locations.html', style:'campus-usyd' },
  unsw: { logo:{src:'/logos/unsw.png',width:330,height:140}, locations:['Scientia Lawn','Roundhouse','Main Library','Library Lawn'], mapUrl:'https://www.unsw.edu.au/about-us/our-story/campuses', style:'campus-unsw' },
  unimelb: { logo:{src:'/logos/unimelb.svg',width:400,height:400}, locations:['South Lawn','Baillieu Library','Arts West','Old Quadrangle'], mapUrl:'https://maps.unimelb.edu.au/', style:'campus-unimelb' },
  monash: { logo:{src:'/logos/monash.svg',width:1024,height:312}, locations:['Campus Centre · Clayton','Sir Louis Matheson Library','Learning and Teaching Building','Monash Sport · Clayton'], mapUrl:'https://www.monash.edu/about/our-locations/clayton-campus', style:'campus-monash' },
  uq: { logo:{src:'/logos/uq.svg',width:204,height:54}, locations:['Great Court · St Lucia','UQ Union Complex','Duhig Tower','UQ Sport · St Lucia'], mapUrl:'https://maps.uq.edu.au/', style:'campus-uq' },
  uwa: { logo:{src:'/logos/uwa.svg',width:211,height:69}, locations:['Oak Lawn','Reid Library','Winthrop Hall','UWA Guild Village'], mapUrl:'https://www.uwa.edu.au/about/locations/campus-map', style:'campus-uwa' },
  adelaide: { logo:{src:'/logos/adelaide.svg',width:800,height:191}, locations:['Hub Central · Adelaide City','Barr Smith Library','Bonython Hall','Union House · Adelaide City'], mapUrl:'https://adelaide.edu.au/life-at-adelaide/campuses/', style:'campus-adelaide' },
};
export const universities=[['anu','Australian National University','ANU'],['usyd','University of Sydney','USYD'],['unsw','UNSW Sydney','UNSW'],['unimelb','University of Melbourne','UniMelb'],['monash','Monash University','Monash'],['uq','The University of Queensland','UQ'],['uwa','The University of Western Australia','UWA'],['adelaide','Adelaide University','Adelaide']];
const emailDomains={anu:['anu.edu.au'],usyd:['sydney.edu.au','uni.sydney.edu.au'],unsw:['unsw.edu.au','ad.unsw.edu.au','zmail.unsw.edu.au'],unimelb:['unimelb.edu.au','student.unimelb.edu.au'],monash:['monash.edu','monash.edu.au','student.monash.edu'],uq:['uq.edu.au','student.uq.edu.au','uq.net.au','uqconnect.edu.au'],uwa:['uwa.edu.au','student.uwa.edu.au'],adelaide:['adelaide.edu.au','student.adelaide.edu.au','adelaideuni.edu.au','study.adelaideuni.edu.au','unisa.edu.au','mymail.unisa.edu.au']};
for(const [slug] of universities)campusDetails[slug].emailDomains=emailDomains[slug];
for(const [slug] of universities){campusDetails[slug].timeZone={unimelb:'Australia/Melbourne',monash:'Australia/Melbourne',uq:'Australia/Brisbane',uwa:'Australia/Perth',adelaide:'Australia/Adelaide'}[slug]||'Australia/Sydney';}
const palettes={anu:'black & gold',usyd:'charcoal & ochre',unsw:'black & yellow',unimelb:'blue & white',monash:'blue & white',uq:'purple & white',uwa:'navy & gold',adelaide:'navy & sky blue'};
for(const [slug,,shortName] of universities)campusDetails[slug].paletteLabel=`${shortName} · ${palettes[slug]}`;
