import { scenes, type Scene } from '../content/scenarios.ts';

/** Synchronous state changes: no delayed response queue survives scene selection. */
export class Conversation {
  scene: Scene = scenes[0]!;
  result: string | null = null;
  pose = this.scene.pose;
  selectedReply: string | null = null;
  select(id: string) {
    const scene = scenes.find(item => item.id === id);
    if (!scene) throw new Error('未知演示场景');
    this.scene = scene; this.restart();
  }
  answer(index: number) {
    if (this.result !== null) return;
    const reply = this.scene.replies[index];
    if (!reply) throw new Error('未知演示回复');
    this.result = reply.response; this.selectedReply = reply.label;
    this.pose = reply.pose ?? this.scene.pose;
  }
  skip() { if (this.result === null) { this.result = this.scene.skipped; this.selectedReply = null; } }
  restart() { this.result = null; this.selectedReply = null; this.pose = this.scene.pose; }
}
