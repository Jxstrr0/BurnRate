/* ===================== app/boot.js: start-up and the title screen =====================
   start() runs once the page has parsed: settings, the save, the title, then the loading splash goes. */
function start(){
  loadSettings();BURN_SOUND.setOn(SETTINGS.sound,SETTINGS.haptics);BURN_SOUND.voice.lang(SETTINGS.voice);
  applyTheme();
  $("verLbl").textContent="v"+VERSION;
  loadSave();renderTitle();initTitle();initBoard();
  initFiring();initReport();
  if(/[?&]debug=1\b/.test(location.search))debugPage();
  if(typeof __ldDone==="function")__ldDone();
  setTimeout(gfxLoad,2500);   // fetch the 3D stand once the title is up (app/gfx.js)
}
start();
</script>
