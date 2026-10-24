import { _electron } from "playwright-core";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const gameRoot = process.env.UPRISING_TEST_ROOT;
assert.ok(gameRoot, "Set UPRISING_TEST_ROOT to an installed game folder.");
const require = createRequire(import.meta.url);
const executablePath = process.env.UPRISING_TEST_EXE || require("electron");
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
const profileRoot=await fs.realpath(path.join(root,'artifacts'));
const profile = await fs.mkdtemp(path.join(profileRoot, "smoke-"));
const args = process.env.UPRISING_TEST_EXE ? [] : [root];
args.push("--user-data=" + profile);
let app;
const errors = [];
try {
  app = await _electron.launch({ executablePath, args, timeout: 20000 });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#welcome").isVisible(), true);
  assert.equal(await page.locator(".welcome-card h1").innerText(),"Explore the Worlds");
  await page.waitForFunction(()=>Array.from(document.fonts).filter(f=>f.status==='loaded').length===3);
  assert.equal(await page.locator("body").evaluate(e=>e.classList.contains('game-typography')),true,"Bundled fonts style the welcome screen before a game is selected");
  await page.screenshot({path:path.join(root,"artifacts","viewer-welcome-fonts.png")});
  const accuracyProbe=await build({entryPoints:[path.join(root,"tests/accuracy-gpu.ts")],bundle:true,write:false,format:"iife",platform:"browser"});
  await page.evaluate(accuracyProbe.outputFiles[0].text);
  const accuracyPixels=await page.evaluate(()=>window.probeAccuracy());
  for(const [actual,expected] of [[accuracyPixels.shade,[100,50,20,255]],[accuracyPixels.sky,[150,60,40,255]],[accuracyPixels.horizon,[85,80,110,255]]])actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<=2,`Native GPU color: ${actual} vs ${expected}`));
  assert.ok(Math.abs(accuracyPixels.yaw)<1e-8,"Native heading zero looks toward positive Z");
  assert.ok(Math.abs(accuracyPixels.fog[0]-accuracyPixels.expectedFog)<=2,"Native radial fog interpolates affinely in screen space");
  console.log("PASS: native inverse terrain modulation and restored layered sky GPU colors.");
  const probe = await build({
    entryPoints: [path.join(root, "tests/terrain-gpu.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  await page.evaluate(probe.outputFiles[0].text);
  const seamResult = await page.evaluate(() => window.probeTerrainSeams());
  assert.equal(
    seamResult.contaminated,
    0,
    "Tile edges must not pick up neighboring texture colors at any tested mip level",
  );
  assert.deepEqual(seamResult.shaderErrors, []);
  console.log(
    `PASS: terrain GPU seam probe (${seamResult.samples} pixels, four scales, separate texture pages).`,
  );
  const cutout = await build({
    entryPoints: [path.join(root, "tests/scenery-gpu.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  await page.evaluate(cutout.outputFiles[0].text);
  const cutoutResult = await page.evaluate(() => window.probeSceneryCutout());
  assert.equal(
    cutoutResult.fringes,
    0,
    "Filtered cutouts must not leak magenta",
  );
  assert.equal(
    cutoutResult.emptyScales,
    0,
    "Cutouts must remain visible at every tested scale",
  );
  console.log(
    `PASS: cutout GPU fringe probe (${cutoutResult.samples} pixels, four scales).`,
  );
  // Exercise the actual folder IPC while supplying the native dialog response.
  const soldierProbe = await build({
    entryPoints: [path.join(root, "tests/sprites-gpu.ts")], bundle: true, write: false, format: "iife", platform: "browser",
  });
  await page.evaluate(soldierProbe.outputFiles[0].text);
  const soldierResult = await page.evaluate(() => window.probeSoldierSprites());
  assert.equal(soldierResult.views, 4, "Sprite stays visible from every camera direction and pitch");
  assert.equal(soldierResult.picked, 4, "Camera-facing soldiers remain ray-pickable");
  assert.equal(soldierResult.mirrored, true, "Fourth direction mirrors the shared side view");
  assert.equal(soldierResult.fringes, 0, "Sprite borders do not leak magenta");
  assert.equal(soldierResult.factionColors,true,"Owner palette affects GPU sprite colors without sharing mutable texture state");
  console.log(`PASS: directional soldier GPU probe (${soldierResult.samples} pixels, four views, mirroring and picking).`);
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: ["Z:/missing-uprising-folder"],
    });
  });
  await page.locator("#choose").click();
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#error").isVisible(), true);
  await page.locator("#error button").click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, gameRoot);
  await page.locator("#choose").click();
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#welcome").isVisible(), false);
  assert.equal(await page.locator("#fog").isChecked(),false,"Fog defaults off for map exploration");
  await page.locator("#fog").check();
  assert.equal(await page.locator("#game-fonts").isEnabled(),true,"Bundled TTF typography is available");
  assert.equal(await page.evaluate(()=>Array.from(document.fonts).filter(f=>f.status==='loaded').length),3);
  assert.match(await page.locator("#mission-title").evaluate(e=>getComputedStyle(e.parentElement).fontFamily),/UprisingDisplay/);
  await page.locator("#game-fonts").uncheck();
  assert.equal(await page.locator("body").evaluate(e=>e.classList.contains('game-typography')),false);
  await page.locator("#game-fonts").check();
  assert.equal(await page.locator("#error").isVisible(), false);
  assert.equal(await page.locator("canvas").count(), 1);
  assert.deepEqual(
    await page.evaluate(() => ({
      node: typeof window.require,
      process: typeof window.process,
    })),
    { node: "undefined", process: "undefined" },
  );
  await page.locator("#mission-button").click();
  assert.equal(await page.locator(".mission-row").count(), 30);
  assert.equal(
    await page.locator("#mission-button").getAttribute("aria-expanded"),
    "true",
  );
  const pickerBox = await page.locator("#mission-menu").boundingBox(),
    buttonBox = await page.locator("#mission-button").boundingBox();
  assert.ok(pickerBox.y >= buttonBox.y + buttonBox.height);
  await page.locator("#mission-search").fill("does-not-exist");
  assert.equal(await page.locator(".mission-row").count(), 0);
  assert.match(await page.locator(".world-empty").innerText(), /No worlds/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#mission-menu").isVisible(), false);
  assert.equal(
    await page
      .locator("#mission-button")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.locator("#mission-button").press("ArrowDown");
  await page.locator("#mission-search").fill("Training");
  await page.keyboard.press("ArrowDown");
  const activeOption = await page
    .locator("#mission-search")
    .getAttribute("aria-activedescendant");
  assert.ok(activeOption);
  await page.keyboard.press("Enter");
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.match(await page.locator("#mission-title").innerText(), /Training \d/);
  await page.locator("#mission-button").click();
  await page.mouse.click(700, 600);
  assert.equal(await page.locator("#mission-menu").isVisible(), false);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.locator("#mission-button").click();
  const smallPicker = await page.locator("#mission-menu").boundingBox();
  assert.ok(smallPicker.y + smallPicker.height <= 640 - 24);
  await page.screenshot({
    path: path.join(root, "artifacts", "world-picker-small.png"),
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1424, height: 921 });
  await page.locator("#mission-button").click();
  await page.locator("#mission-search").fill("Dakka");
  await page.locator(".mission-row").click();
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#mission-title").innerText(), "Dakka");
  await page.locator("[data-reader=briefing]").click();
  assert.match(await page.locator("#reader-content").innerText(), /volcano/i);
  const before = await page.locator("#coordinates").innerText();
  await page.locator("[data-reader=script]").click();
  assert.ok((await page.locator(".source-line").count()) > 100);
  await page.locator("#text-search").fill("CREATE");
  assert.ok((await page.locator("mark").count()) > 0);
  await page.locator("#dock").click();
  await page.locator("#expand").click();
  await page.locator("#expand").click();
  await page.locator("#close-reader").click();
  assert.equal(
    await page.locator("#coordinates").innerText(),
    before,
    "Reading preserves the camera",
  );
  await page.locator("#object-search").fill("tank");
  assert.ok((await page.locator(".object-row").count()) > 0);
  await page.locator(".object-row").first().click();
  assert.equal(await page.locator("#selection").isVisible(), true);
  assert.match(
    await page.locator("#selection-body").innerText(),
    /Static model/,
  );
  assert.match(await page.locator("#selection-body").innerText(), /rst1t\.bdm/);
  await page.locator("#focus").click();
  // The selected tank is centered after focusing. Click its actual geometry.
  await page.locator("#deselect").click();
  const canvasBounds = await page.locator("canvas").boundingBox();
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  assert.equal(
    await page.locator("#selection").isVisible(),
    true,
    "Static model meshes remain pickable",
  );
  await page.screenshot({
    path: path.join(root, "artifacts", "viewer-static-tank.png"),
  });
  // Infantry presents the frozen spawn sprite with native catalog provenance.
  await page.locator("#mission-button").click();
  await page.locator("#mission-search").fill("Aranon");
  await page.locator(".mission-row").click();
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.locator("#object-search").fill("soldier");
  await page.locator(".object-row").first().click();
  assert.match(
    await page.locator("#selection-body").innerText(),
    /Static sprite · frame 0/,
  );
  assert.match(
    await page.locator("#selection-body").innerText(),
    /insit.sqc/,
  );
  await page.locator("#focus").click();
  await page.locator("#deselect").click();
  const soldierCanvas = await page.locator("canvas").boundingBox();
  await page.mouse.click(soldierCanvas.x + soldierCanvas.width/2, soldierCanvas.y + soldierCanvas.height/2);
  assert.match(await page.locator("#selection-body").innerText(), /Static sprite · frame 0/, "Actual mission sprite can be selected through the terrain-aware scene picker");
  await page.screenshot({path:path.join(root,"artifacts","viewer-static-soldier.png")});
  await page.locator("#mission-button").click();
  await page.locator("#mission-search").fill("Dakka");
  await page.locator(".mission-row").click();
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.locator("#object-search").fill("tank");
  await page.locator(".object-row").first().click();
  const preview = await page.evaluate(() =>
    window.viewer.loadLevel("grids/dakka.lfl", 4),
  );
  assert.equal(preview.ok, true);
  assert.deepEqual(await page.evaluate(data=>window.probeFogControl(data),preview.data),[true,true,true,true,true,true,true],"Manual fog is independent of sky, camera height/pitch and mission reloads");
  const nativeView=await fs.readFile(path.join(root,"artifacts/native-reference-dakka/view.bin")).catch(()=>null);
  const nativeProjection=await fs.readFile(path.join(root,"artifacts/native-reference-dakka/projection.bin")).catch(()=>null);
  if(nativeView&&nativeProjection){
    const floats=b=>Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));
    const png=await page.evaluate(({data,view,projection})=>window.captureNativeView(data,view,projection),{data:preview.data,view:floats(nativeView),projection:floats(nativeProjection)});
    await fs.writeFile(path.join(root,"artifacts/viewer-native-camera-dakka.png"),Buffer.from(png.split(',')[1],'base64'));
    console.log("PASS: actual scene rendered at the decompiled game's captured camera/projection.");
  }
  assert.ok(
    Object.values(preview.data.modelSelections).some(
      (s) => s.model === "models/rst1t.bdm",
    ),
    "Player preview does not override clan technology",
  );
  const invalidPreview = await page.evaluate(() =>
    window.viewer.loadLevel("grids/dakka.lfl", 99),
  );
  assert.equal(invalidPreview.ok, false);
  await page.locator("#clear-filters").click();
  await page.locator("#object-search").fill("rabble aav factory");
  assert.ok(await page.locator(".object-row").count()>0,"Faction and building type are searchable together");
  await page.locator(".object-row").first().click();
  assert.equal(await page.locator("#selection-title").innerText(),"Rabble AAV Factory");
  const buildingDetails=await page.locator("#selection-body dt").evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.textContent,row.nextElementSibling.textContent])));
  assert.equal(buildingDetails.Type,"AAV Factory");assert.equal(buildingDetails.Owner,"Rabble");
  assert.match(buildingDetails["Source IDs"],/kind 0x62/);
  assert.equal(await page.locator('#owner-filter option[value="5"]').count(),1);
  assert.equal(await page.locator('#owner-filter option[value="8"]').count(),0,"Native owner aliases share one faction filter");
  await page.screenshot({path:path.join(root,"artifacts","viewer-named-aav-factory.png")});
  await page.locator("#clear-filters").click();
  if(!await page.locator("#type-filter").isVisible())await page.locator("#browse-objects").click();
  await page.locator("#type-filter").selectOption("citadels");
  await page.locator("#owner-filter").selectOption("4");
  assert.equal(await page.locator(".object-row").count(),5);
  await page.locator(".object-row").first().click();
  assert.match(await page.locator("#selection-body").innerText(),/icy1t.bdm/);
  const firstCitadel=await page.locator("#selection-title").innerText();
  await page.locator("#next-object").click();
  assert.notEqual(await page.locator("#selection-title").innerText(),firstCitadel);
  await page.locator("#previous-object").click();
  assert.equal(await page.locator("#selection-title").innerText(),firstCitadel);
  await page.locator("#faction-colors").uncheck();
  await page.locator("#loading").waitFor({state:"hidden"});
  assert.equal(await page.locator("#selection-title").innerText(),firstCitadel);
  await page.locator("#faction-colors").check();
  await page.locator("#loading").waitFor({state:"hidden"});
  await page.screenshot({path:path.join(root,"artifacts","viewer-citadel-browser.png")});
  const panels=await page.evaluate(()=>({layers:document.querySelector('.layers').getBoundingClientRect().bottom,selection:document.querySelector('#selection').getBoundingClientRect().top}));
  assert.ok(panels.selection>=panels.layers+8,"Inspector does not overlap layer controls");
  const originalViewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  await page.setViewportSize({width:920,height:680});
  await page.waitForFunction(()=>innerWidth<950,undefined,{timeout:5000});
  await page.waitForFunction(()=>{const a=document.querySelector('.layers').getBoundingClientRect(),b=document.querySelector('#selection').getBoundingClientRect();return b.height>70&&b.top>=a.bottom+8;},undefined,{timeout:3000});
  const compact=await page.evaluate(()=>({layers:document.querySelector('.layers').getBoundingClientRect().bottom,selection:document.querySelector('#selection').getBoundingClientRect().toJSON()}));
  assert.ok(compact.selection.height>70 && compact.selection.top>=compact.layers+8,"Compact inspector remains usable below the scrolling layer panel");
  await page.screenshot({path:path.join(root,"artifacts","viewer-citadel-compact.png")});
  await page.setViewportSize(originalViewport);
  await page.waitForFunction(()=>innerWidth>1300,undefined,{timeout:5000});
  await page.locator("#owner-filter").selectOption("-1");
  assert.equal(await page.locator(".object-row").count(),2);
  assert.equal(await page.locator("#selection").isVisible(),false,"Filtering out the selection removes its helper");
  await page.locator(".object-row").first().click();
  assert.match(await page.locator("#selection-body").innerText(),/Unclaimed site/);
  await page.locator("#clear-filters").click();
  if(!await page.locator("#type-filter").isVisible())await page.locator("#browse-objects").click();
  await page.locator("#type-filter").selectOption("gates");
  assert.equal(await page.locator(".object-row").count(),38);
  await page.locator(".object-row").first().click();
  assert.match(await page.locator("#selection-body").innerText(),/wgt1.bdm/);
  await page.locator("#focus").click();
  await page.screenshot({path:path.join(root,"artifacts","viewer-native-gate.png")});
  await page.locator("[data-layer=gates]").uncheck();
  await page.locator("[data-layer=gates]").check();
  await page.locator("#type-filter").selectOption("players");
  assert.ok(await page.locator(".object-row").count()>0);
  await page.locator(".object-row").first().click();
  assert.match(await page.locator("#selection-body").innerText(),/ppt1t.bdm/);
  await page.locator("#focus").click();
  await page.screenshot({path:path.join(root,"artifacts","viewer-native-wraith.png")});
  await page.locator("#clear-filters").click();
  if(!await page.locator("#type-filter").isVisible())await page.locator("#browse-objects").click();
  await page.locator("#object-search").fill("tank");
  await page.locator(".object-row").first().click();
  await page.locator("[data-layer=objects]").uncheck();
  await page.locator("[data-layer=objects]").check();
  await page.locator("#surface").selectOption("height");
  await page.locator("#surface").selectOption("wireframe");
  await page.locator("#surface").selectOption("textured");
  await page.locator("[data-camera=fly]").click();
  const beforeFlight = await page.locator("#coordinates").innerText();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  assert.notEqual(
    await page.locator("#coordinates").innerText(),
    beforeFlight,
    "Flight keys move the camera",
  );
  await page.locator("[data-camera=top]").click();
  await page.locator("#reset").click();
  await page.locator("[data-reader=environment]").click();
  assert.match(
    await page.locator("#reader-content").innerText(),
    /Native terrain lighting/,
  );
  await page.locator("#close-reader").click();
  await page.locator("#deselect").click();
  await page.locator("#hide").click();
  assert.equal(
    await page
      .locator("#app")
      .evaluate((e) => e.classList.contains("ui-hidden")),
    true,
  );
  await page.locator("#hide").click();
  await page.screenshot({
    path: path.join(root, "artifacts", "viewer-dakka.png"),
  });
  for(const title of ["Circus","Centari","Rhemorrah"]){
    await page.locator("#mission-button").click();await page.locator("#mission-search").fill(title);await page.locator(".mission-row").click();await page.locator("#loading").waitFor({state:"hidden"});
    if(title==="Circus"){
      await page.locator("#clear-filters").click();if(!await page.locator("#type-filter").isVisible())await page.locator("#browse-objects").click();
      await page.locator("#type-filter").selectOption("teleporters");assert.equal(await page.locator(".object-row").count(),4);
      await page.locator(".object-row").first().click();assert.match(await page.locator("#selection-body").innerText(),/wte1.bdm/);await page.locator("#focus").click();
      await page.screenshot({path:path.join(root,"artifacts","viewer-native-teleporter.png")});
      await page.locator("#type-filter").selectOption("players");const allPlayers=await page.locator(".object-row").count();
      await page.locator("#scene-preview").selectOption("single");assert.equal(await page.locator(".object-row").count(),1);
      await page.locator("#scene-preview").selectOption("multi");assert.equal(await page.locator(".object-row").count(),allPlayers);
      await page.locator("#scene-preview").selectOption("all");await page.locator("#clear-filters").click();
    }
    await page.locator("#reset").click();await page.screenshot({path:path.join(root,"artifacts",`viewer-accuracy-${title.toLowerCase()}.png`)});
  }
  await page.locator("#mission-button").click();await page.locator("#mission-search").fill("Dakka");await page.locator(".mission-row").click();await page.locator("#loading").waitFor({state:"hidden"});
  console.log("PASS: gate, Wraith and teleporter inspectors, owner mode previews, and fallback/no-sky worlds.");
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page.locator("#folder").click();
  await page.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#mission-title").innerText(), "Dakka");
  assert.deepEqual(errors, []);
  await page.locator("#game-fonts").uncheck();
  await app.close();
  app = null;
  const saved = JSON.parse(
    await fs.readFile(path.join(profile, "viewer.json"), "utf8"),
  );
  assert.equal(saved.lastMission, "grids/dakka.lfl");
  app = await _electron.launch({ executablePath, args, timeout: 20000 });
  const restored = await app.firstWindow();
  await restored.waitForLoadState("domcontentloaded");
  await restored.locator("#loading").waitFor({ state: "hidden" });
  assert.equal(await restored.locator("#mission-title").innerText(), "Dakka");
  assert.equal(await restored.locator("#fog").isChecked(),true,"Fog preference persists across mission changes and restarts");
  await restored.locator("#fog").uncheck();
  assert.equal(await restored.locator("#game-fonts").isChecked(),false,"System-font fallback persists across restarts");
  assert.equal(await restored.locator("body").evaluate(e=>e.classList.contains('game-typography')),false);
  await restored.locator("#game-fonts").check();
  await restored.locator("[data-reader=briefing]").click();
  await restored.screenshot({
    path: path.join(root, "artifacts", "viewer-dakka-reader.png"),
  });
  console.log(
    "PASS: folder validation, 30 missions, terrain canvas, reading, search, selection, layers, cameras, isolation, cancellation and restart persistence.",
  );
} catch (error) {
  console.error("Renderer errors:", errors);
  if (app) {
    const windows = app.windows();
    if (windows[0]) {
      console.error(
        (await windows[0].locator("body").innerText()).slice(0, 5000),
      );
      await windows[0].screenshot({
        path: path.join(root, "artifacts", "smoke-failure.png"),
      });
    }
  }
  throw error;
} finally {
  try {
    if (app) await app.close();
  } finally {
    const resolvedProfile=await fs.realpath(profile);
    const relative=path.relative(profileRoot,resolvedProfile);
    assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(resolvedProfile).startsWith('smoke-'),'Refusing to remove a profile outside the generated smoke-test directory');
    await fs.rm(resolvedProfile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
