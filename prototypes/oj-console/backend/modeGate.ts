import { OjConsoleError } from "./contracts";

export const REAL_MODE_UNLOCK_PHRASE = "我确认本次操作可能向在线评测平台真实提交代码";

export class RealModeGate {
  private unlocked = false;

  public unlock(phrase: string): void {
    if (phrase !== REAL_MODE_UNLOCK_PHRASE) {
      throw new OjConsoleError("real_mode_locked", "真实模式确认短语不正确。", 403);
    }
    this.unlocked = true;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public requireUnlocked(): void {
    if (!this.unlocked) {
      throw new OjConsoleError("real_mode_locked", "真实模式仍处于锁定状态。", 403);
    }
  }
}
