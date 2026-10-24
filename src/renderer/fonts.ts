const installed:FontFace[]=[];
export async function installGameFonts() {
  for(const font of installed) document.fonts.delete(font);
  installed.length=0;
  for(const [family,file] of [["UprisingDisplay","Neuropol.ttf"],["UprisingAccent","LAUCLP__.TTF"],["UprisingText","LiberationSans-Regular.ttf"]]) {
    try {
      const face = new FontFace(family,`url("${new URL(`fonts/${file}`,location.href).href}") format("truetype")`);
      await face.load();document.fonts.add(face);installed.push(face);
    } catch { /* Keep normal system typography if the file is unsupported. */ }
  }
  const display=installed.some(f=>f.family==="UprisingDisplay"), accent=installed.some(f=>f.family==="UprisingAccent");
  document.documentElement.style.setProperty("--game-display",display ? '"UprisingDisplay", sans-serif' : '"Segoe UI", sans-serif');
  document.documentElement.style.setProperty("--game-accent",accent ? '"UprisingAccent", sans-serif' : '"Segoe UI", sans-serif');
  document.documentElement.style.setProperty("--game-text",installed.some(f=>f.family==="UprisingText") ? '"UprisingText", "Segoe UI", sans-serif' : '"Segoe UI", sans-serif');
  return display || accent;
}
