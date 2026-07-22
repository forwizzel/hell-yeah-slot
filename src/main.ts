import "./styles.css";
import { GameController } from "./core/GameController";
import { GameView } from "./presentation/GameView";

const backgroundVideoUrl = new URL("../graphics/BackgroundVideo.webm", import.meta.url).href;

async function start(): Promise<void> {
  initializeBackgroundVideo();
  const view = await GameView.create();
  new GameController(view).initialize();
}

function initializeBackgroundVideo(): void {
  const video = document.getElementById("background-video");
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error("Required background video was not found");
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updatePlayback = (): void => {
    if (reducedMotion.matches) {
      video.pause();
      return;
    }
    if (video.src === "") {
      video.src = backgroundVideoUrl;
    }
    void video.play().catch(() => {
      // Muted autoplay can still be blocked by browser or device policy.
    });
  };

  reducedMotion.addEventListener("change", updatePlayback);
  updatePlayback();
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  const app = document.getElementById("app");
  if (app !== null) {
    app.textContent = `Unable to start the prototype: ${message}`;
  }
});
