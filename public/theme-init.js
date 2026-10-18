// Apply the preference before styles paint, without waiting for the app or API.
(()=>{
  let mode='system';
  try{const saved=localStorage.getItem('campuswall-appearance');if(['light','dark','system'].includes(saved))mode=saved;}catch{}
  const dark=mode==='dark'||mode==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.style.colorScheme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#14181d':'#f7f6f2');
})();
