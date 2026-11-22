import './style.css';
import { GameApp } from './app/GameApp';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

async function boot(): Promise<void> {
  try {
    const app = new GameApp();
    await app.start(canvas);
    console.log('[goose-ring] P0-1 启动成功：Three.js + Rapier WASM 已初始化');
  } catch (err) {
    // Rapier WASM 加载失败等致命错误：显式呈现，不在控制台静默刷错
    const fatal = document.getElementById('fatal-error');
    if (fatal) {
      fatal.hidden = false;
      fatal.textContent = `初始化失败：${err instanceof Error ? err.message : String(err)}`;
    }
    console.error('[goose-ring] 初始化失败', err);
  }
}

void boot();
