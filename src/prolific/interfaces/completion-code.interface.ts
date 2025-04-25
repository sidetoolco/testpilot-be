export interface CompletionCode {
  code: string;
  code_type: 'COMPLETED' | 'FAILED';
  actions: { acton: 'MANUALLY_REVIEW' | 'AUTO_APPROVE' | 'AUTO_REJECT' }[];
}
