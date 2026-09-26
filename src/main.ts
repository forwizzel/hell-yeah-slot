import "./styles.css";
import { GameController } from "./core/GameController";
import { GameView } from "./presentation/GameView";

const backgroundVideoUrl = new URL("../graphics/BG_VIDEO.mp4", import.meta.url).href;
const hellYeahLogoUrl = new URL("../graphics/TOPBAR_LOGO.png", import.meta.url).href;

async function start(): Promise<void> {
  initializeBackgroundVideo();
  initializeLogo();
  const view = await GameView.create();
  new GameController(view).initialize();
}

function initializeLogo(): void {
  const logo = document.getElementById("hell-yeah-logo");
  if (!(logo instanceof HTMLImageElement)) {
    throw new Error("Required Hell Yeah logo was not found");
  }
  logo.src = hellYeahLogoUrl;
}

function initializeBackgroundVideo(): void {
  const video = document.getElementById("background-video");
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error("Required background video was not found");
  }

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateVideo = (): void => {
    if (motionPreference.matches) {
      video.pause();
      return;
    }
    if (!video.hasAttribute("src")) {
      video.src = backgroundVideoUrl;
    }
    void video.play().catch(() => {
      // Muted autoplay can still be blocked by browser or device policy.
    });
  };
  motionPreference.addEventListener("change", updateVideo);
  updateVideo();
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  const app = document.getElementById("app");
  if (app !== null) {
    app.textContent = `Unable to start Hell Yeah: ${message}`;
  }
});
