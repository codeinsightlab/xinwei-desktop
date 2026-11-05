import { ref } from 'vue';
import { config, notice } from './state';
import { desktop } from '../platform/desktop';
import { clock } from './clock';
import { reduceEngagement } from '../domain/engagement';
import type { Command, Receipt } from '../domain/engagement';
import { trackWrite,recordWriteFailure,quitId } from './activity';

export const interaction = ref<Receipt>();
export const engagementBusy = ref(false);
let serial: Promise<unknown> = Promise.resolve();

// Each window proposes a change against an observed revision. The platform owns
// the compare-and-swap and broadcasts only after replacing the file successfully.
export function engage(command: Command, expectedRevision?: number): Promise<boolean> {
  if(quitId.value!==undefined && command.type==='checkpoint')return Promise.resolve(false);
  const clickedAt = clock.now();
  async function commit() {
    engagementBusy.value = true;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const loaded = await desktop.load();
        if (loaded.recoveryRequired) throw Error('请先恢复本地配置');
        const current = loaded.config;
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw Error('记录已更新，请重新查看预览后确认');
        }
        const result = reduceEngagement(current, command, clickedAt);
        if (!result.changed) {
          config.value = current;
          return true;
        }
        try {
          config.value = await desktop.saveEngagement(result.ledger, current.revision,command.type==='checkpoint');
          if (result.event) interaction.value = result.event;
          return true;
        } catch (error) {
          if (expectedRevision === undefined && attempt < 3 && /已更新|已在其他入口更新/.test(String(error))) continue;
          throw error;
        }
      }
      return false;
    } catch (error) {
      if (command.type === 'checkpoint') console.warn('时间互动未保存，已跳过', error);
      else {recordWriteFailure();notice.value = error instanceof Error ? error.message : String(error);}
      return false;
    } finally {
      engagementBusy.value = false;
    }
  }
  const previous=serial;
  const result = trackWrite(()=>previous.then(commit));
  serial = result.catch(() => {});
  return result;
}
