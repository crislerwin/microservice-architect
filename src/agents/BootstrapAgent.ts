import { ChatOpenAI } from "@langchain/openai";
import {
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { SystemInfoTool } from "@/tools/SystemInfoTool.ts";

export class BootstrapAgent {
  private model: ChatOpenAI;
  private tools = [new SystemInfoTool()];
  private modelWithTools;

  constructor() {
    this.model = new ChatOpenAI({
      model: process.env.LLM_MODEL || "gpt-4o",
      temperature: 0,
      apiKey: process.env.LLM_API_KEY,
      configuration: {
        baseURL: process.env.LLM_BASE_URL,
      },
    });
    this.modelWithTools = this.model.bindTools(this.tools);
  }

  async run(userInput: string) {
    console.log(`User: ${userInput}`);

    const messages: BaseMessage[] = [new HumanMessage(userInput)];

    // First call to the model
    const aiMessage = await this.modelWithTools.invoke(messages);
    messages.push(aiMessage);

    // Check for tool calls
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      console.log("Agent decided to call tools:", aiMessage.tool_calls);

      for (const toolCall of aiMessage.tool_calls) {
        const selectedTool = this.tools.find((t) => t.name === toolCall.name);
        if (selectedTool) {
          console.log(`Executing ${toolCall.name}...`);
          const toolOutput = await selectedTool.invoke(toolCall.args);
          console.log(`Tool Output: ${toolOutput}`);

          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id!,
              content: toolOutput,
            })
          );
        }
      }

      // Final call to model to summarize
      const finalResponse = await this.modelWithTools.invoke(messages);
      console.log("Agent:", finalResponse.content);
      return finalResponse.content;
    } else {
      console.log("Agent:", aiMessage.content);
      return aiMessage.content;
    }
  }
}
