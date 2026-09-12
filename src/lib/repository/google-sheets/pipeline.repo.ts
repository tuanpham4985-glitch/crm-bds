import type { IPipelineRepository, PipelineCustomerRefFields, PipelineStatusFields } from '../interfaces';
import type { Pipeline } from '../../types';
import {
  getPipeline,
  addPipeline,
  updatePipeline,
  deletePipeline,
} from '../../google-sheets';

export class GoogleSheetsPipelineRepository implements IPipelineRepository {
  findAll(): Promise<Pipeline[]> {
    return getPipeline();
  }

  // IMPORT_BATCH_P1 — xem PipelineCustomerRefFields (interfaces.ts) cho lý do.
  async findCustomerRefs(): Promise<PipelineCustomerRefFields[]> {
    const all = await getPipeline();
    return all.map(p => ({ id_khach_hang: p.id_khach_hang }));
  }

  // BANG_HANG_PIPELINE_P2 — xem PipelineStatusFields (interfaces.ts) cho lý do.
  async findStatusFields(): Promise<PipelineStatusFields[]> {
    const all = await getPipeline();
    return all.map(p => ({ ma_can: p.ma_can, giai_doan: p.giai_doan, id_du_an: p.id_du_an }));
  }

  async findById(id: string): Promise<Pipeline | null> {
    const all = await getPipeline();
    return all.find(p => p.id_pipeline === id) ?? null;
  }

  create(data: Pipeline): Promise<void> {
    return addPipeline(data);
  }

  update(data: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
    return updatePipeline(data);
  }

  delete(id: string): Promise<boolean> {
    return deletePipeline(id);
  }
}
