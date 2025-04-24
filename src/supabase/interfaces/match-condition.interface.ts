export interface MatchCondition<T> {
  key: keyof T;
  value: string | number | boolean;
}
