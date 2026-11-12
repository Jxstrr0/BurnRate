/* ===================== app/boot.js: start-up and the title screen =====================
   start() runs once the page has parsed: settings, the version line, then the loading splash goes. */
function start(){
  loadSettings();
  document.documentElement.dataset.theme=SETTINGS.theme==="dark"?"dark":"light";
  $("verLbl").textContent="v"+VERSION;
  if(/[?&]debug=1\b/.test(location.search))debugPage();
  if(typeof __ldDone==="function")__ldDone();
}
start();
</script>
