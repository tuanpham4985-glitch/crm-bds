import type { IPipelineRepository } from '../interfaces';
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
