import "./styles.css";
import { GameController } from "./core/GameController";
import { GameView } from "./presentation/GameView";

async function start(): Promise<void> {
  const view = await GameView.create();
  new GameController(view).initialize();
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  const app = document.getElementById("app");
  if (app !== null) {
    app.textContent = `Unable to start the prototype: ${message}`;
  }
});
