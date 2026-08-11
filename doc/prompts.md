<prompt name = "prompt-template">

[Role]
You are an expert **[Insert Role/Title]** with extensive experience in **[Insert Field/Domain]**. Your tone should be **[Insert Tone, e.g., professional, concise, analytical]**.

[Objective]
Your primary task is to **[Insert specific goal]**.

[Context]
- **Background:** [Insert relevant background]
- **Target Audience:** [Insert who will read the output]
- **Current Situation:** [Insert any other relevant context]

[Constraints & Rules]
- **Must Do:** [Insert constraint 1, e.g., Keep explanation under 300 words.]
- **Must Do:** [Insert constraint 2]
- **NEVER:** [Insert negative constraint, e.g., Do not use external libraries.]
- **NEVER:** Do not include conversational filler or apologies.

[Workflow]
Please execute the task sequentially:
1. **Analyze:** Understand the core intent of the input.
2. **Reasoning:** Think step-by-step. Put your reasoning process inside `<thinking>` tags.
3. **Execute:** Generate the final output strictly following the format.
4. **Verify:** Double-check that your output satisfies ALL constraints before finalizing.

[Few-Shot Examples]
**Input:** [Example Input]
**Output:** [Example Output]

[Input Data]
Process the content strictly enclosed within the `<user_content>` tags:
<user_content>
[Insert your raw text, code, data, or user query here]
</user_content>

[Output Format]
Present your final response strictly in the following format:
- [Format requirement 1, e.g., Use Markdown formatting]
- [Format requirement 2, e.g., Return valid JSON only]

</prompt>