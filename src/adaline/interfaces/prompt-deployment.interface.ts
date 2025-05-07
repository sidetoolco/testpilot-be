export interface PromptDeployment {
  config: Config;
  messages: Message[];
  variables: Variable[];
}

interface Config {
  provider: string;
  model: string;
}

interface Message {
  role: string;
  content: Value[];
}

interface Value {
  modality: string;
  value: string;
}

interface Variable {
  name: string;
  value: Value;
}
