import { StudyStatus } from 'prolific/types';
import { CompletionCode } from './completion-code.interface';

export interface ProlificStudy {
  id: string;
  name: string;
  description: string;
  external_study_url: string;
  prolific_id_option: string;
  completion_codes: CompletionCode[];
  total_available_places: number;
  estimated_completion_time: number;
  maximum_allowed_time: number;
  reward: number;
  status: StudyStatus;
  internal_name: string;
  access_details: Array<{
    external_url: string;
    total_allocation: number;
  }>;
  device_compatibility: string[];
  peripheral_requirements: string[];
  filters: Array<{
    filter_id: string;
    selected_values?: string[];
    selected_range?: {
      lower: number;
      upper: number;
    };
  }>;
}
