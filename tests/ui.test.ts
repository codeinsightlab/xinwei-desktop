import { describe,it,expect } from 'vitest';
import { h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import SalaryAmount from '../src/shared/SalaryAmount.vue';
import WorkStatusBadge from '../src/shared/WorkStatusBadge.vue';
import ProgressIndicator from '../src/shared/ProgressIndicator.vue';
describe('shared visual components',()=>{
  it('never serializes the sensitive value when masked',async()=>{const html=await renderToString(h(SalaryAmount,{value:1680000n,hidden:true,hero:true}));expect(html).toContain('••••••');expect(html).not.toMatch(/16,800|1680000/);});
  it('formats visible amounts through the shared formatter',async()=>{const html=await renderToString(h(SalaryAmount,{value:45000n}));expect(html).toContain('450.00');});
  it('keeps long amounts complete with a responsive class',async()=>{const html=await renderToString(h(SalaryAmount,{value:9999999999n,hero:true}));expect(html).toContain('99,999,999.99');expect(html).toContain('long');});
  it('does not depend on color alone for a break state',async()=>{const html=await renderToString(h(WorkStatusBadge,{status:'BREAK'}));expect(html).toContain('午休中');expect(html).toContain('data-status="BREAK"');});
  it('preserves an exact meaningful progress value',async()=>{const html=await renderToString(h(ProgressIndicator,{value:.5625}));expect(html).toContain('aria-valuenow="56.25"');expect(html).toContain('width:56.25%');});
  it('clamps progress at the boundary',async()=>{const html=await renderToString(h(ProgressIndicator,{value:1.1}));expect(html).toContain('aria-valuenow="100"');});
});
