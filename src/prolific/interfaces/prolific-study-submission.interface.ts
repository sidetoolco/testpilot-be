export interface ProlificStudySubmission {
  results: {
    id: string;
    participant_id: string;
    started_at: Date;
    completed_at: Date;
    is_complete: boolean;
    time_taken: number;
    reward: number;
    status: string;
    study_code: string;
    ip: string;
    has_siblings: boolean;
    time_taken_under_auto_approval_threshold: boolean;
  }[];
}
