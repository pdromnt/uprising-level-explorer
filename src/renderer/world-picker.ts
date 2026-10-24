import type { Mission } from "../shared/types";

const chevron =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const worldIcon =
  '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 13h4l2-4 3 7 2-4h5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const check =
  '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const worldTitle = (title: string) =>
  title.replace(/([a-z])(\d+)/gi, "$1 $2");

export class WorldPicker {
  private missions: Mission[] = [];
  private current: string | null = null;
  private active = 0;
  private filtered: Mission[] = [];
  private button = document.getElementById("mission-button")!;
  private menu = document.getElementById("mission-menu")!;
  private search = document.getElementById(
    "mission-search",
  ) as HTMLInputElement;
  private list = document.getElementById("mission-list")!;
  constructor(private choose: (id: string) => void) {
    // Portal the popover outside the navigator's backdrop/stacking context.
    document.getElementById("app")!.append(this.menu);
    this.menu.setAttribute("role", "dialog");
    this.menu.setAttribute("aria-label", "Choose a world");
    this.button.setAttribute("aria-haspopup", "dialog");
    this.button.setAttribute("aria-controls", "mission-menu");
    this.button.setAttribute("aria-expanded", "false");
    this.button.querySelector("span:last-child")!.innerHTML = chevron;
    this.search.placeholder = "Search worlds…";
    this.search.setAttribute("aria-label", "Search worlds");
    this.search.setAttribute("role", "combobox");
    this.search.setAttribute("aria-controls", "mission-list");
    this.search.setAttribute("aria-autocomplete", "list");
    const searchbar = document.createElement("div");
    searchbar.className = "world-search";
    this.search.before(searchbar);
    searchbar.append(this.search);
    const hint = document.createElement("kbd");
    hint.textContent = "Esc";
    searchbar.append(hint);
    const heading = document.createElement("div");
    heading.className = "world-picker-heading";
    heading.innerHTML =
      '<span>WORLD LIBRARY</span><span id="mission-results"></span>';
    this.list.before(heading);
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Worlds");
    this.button.onclick = () => (this.isOpen ? this.close(false) : this.open());
    this.search.oninput = () => {
      this.active = 0;
      this.render();
    };
    this.search.onkeydown = (e) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        this.move(e.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.pick(this.active);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    this.button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!this.isOpen) this.open();
      }
    });
    this.menu.addEventListener("keydown", (e) => {
      if (e.target === this.search) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        this.search.focus();
        this.move(e.key);
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (
        this.isOpen &&
        !this.menu.contains(e.target as Node) &&
        !this.button.contains(e.target as Node)
      )
        this.close(false);
    });
    document.addEventListener("focusin", (e) => {
      if (
        this.isOpen &&
        !this.menu.contains(e.target as Node) &&
        !this.button.contains(e.target as Node)
      )
        this.close(false);
    });
    window.addEventListener("resize", () => {
      if (this.isOpen) this.position();
    });
  }
  get isOpen() {
    return !this.menu.hidden;
  }
  update(missions: Mission[], current: string | null) {
    this.missions = missions;
    this.current = current;
    this.render();
  }
  open() {
    this.search.value = "";
    this.active = Math.max(
      0,
      this.missions.findIndex((m) => m.id === this.current),
    );
    this.menu.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    this.search.setAttribute("aria-expanded", "true");
    this.position();
    this.render();
    this.search.focus();
  }
  close(restoreFocus = true) {
    this.menu.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    this.search.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.button.focus();
  }
  private position() {
    const rect = this.button.getBoundingClientRect(),
      nav = this.button.closest(".navigator")!.getBoundingClientRect();
    const width = Math.min(368, window.innerWidth - 48);
    this.menu.style.left =
      Math.min(nav.left, window.innerWidth - width - 24) + "px";
    this.menu.style.top = rect.bottom + 8 + "px";
    this.menu.style.width = width + "px";
    this.menu.style.maxHeight =
      Math.min(500, window.innerHeight - rect.bottom - 54) + "px";
  }
  private move(key: string) {
    const n = this.filtered.length;
    if (!n) return;
    this.active =
      key === "Home"
        ? 0
        : key === "End"
          ? n - 1
          : (this.active + (key === "ArrowDown" ? 1 : -1) + n) % n;
    this.highlight();
  }
  private pick(index: number) {
    const mission = this.filtered[index];
    if (!mission) return;
    this.close(false);
    this.choose(mission.id);
    this.button.focus();
  }
  private render() {
    const query = this.search.value.trim().toLowerCase();
    this.filtered = this.missions.filter((m) =>
      `${worldTitle(m.title)} ${m.title} ${m.environment} ${m.categories.join(" ")}`
        .toLowerCase()
        .includes(query),
    );
    this.active = Math.min(this.active, Math.max(0, this.filtered.length - 1));
    this.list.replaceChildren();
    document.getElementById("mission-results")!.textContent =
      `${this.filtered.length} / ${this.missions.length}`;
    this.filtered.forEach((mission, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className =
        "mission-row" + (mission.id === this.current ? " current" : "");
      row.id = "world-option-" + i;
      row.tabIndex = -1;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(mission.id === this.current));
      const icon = document.createElement("span");
      icon.className =
        "world-icon " +
        mission.environment.toLowerCase().replace(/[^a-z]/g, "");
      icon.innerHTML = worldIcon;
      const copy = document.createElement("span");
      copy.className = "world-copy";
      const title = document.createElement("strong");
      title.textContent = worldTitle(mission.title);
      const meta = document.createElement("small");
      meta.textContent =
        [
          mission.environment === "Unknown"
            ? ""
            : mission.environment.toLowerCase(),
          ...new Set(mission.categories.map((c) => c.toLowerCase())),
        ]
          .filter(Boolean)
          .join(" · ") || "World";
      copy.append(title, meta);
      const selected = document.createElement("span");
      selected.className = "world-selected";
      if (mission.id === this.current) selected.innerHTML = check;
      row.append(icon, copy, selected);
      row.onclick = () => this.pick(i);
      row.onpointermove = () => {
        this.active = i;
        this.highlight(false);
      };
      this.list.append(row);
    });
    if (!this.filtered.length) {
      const empty = document.createElement("div");
      empty.className = "world-empty";
      empty.textContent = "No worlds match your search.";
      this.list.append(empty);
    }
    this.highlight();
  }
  private highlight(scroll = true) {
    const rows = this.list.querySelectorAll(".mission-row");
    rows.forEach((row, i) =>
      row.classList.toggle("picker-active", i === this.active),
    );
    const active = rows[this.active];
    if (active) {
      this.search.setAttribute("aria-activedescendant", active.id);
      if (scroll && this.isOpen) active.scrollIntoView({ block: "nearest" });
    } else this.search.removeAttribute("aria-activedescendant");
  }
}
