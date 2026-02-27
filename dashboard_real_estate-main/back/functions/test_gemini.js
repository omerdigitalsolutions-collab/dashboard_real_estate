const { GoogleGenerativeAI } = require("@google/generative-ai");

async function run() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent("Say hello");
        console.log("gemini-2.5-flash Success:", result.response.text());
    } catch (e) {
        console.error("gemini-2.5-flash Error:", e.message);
    }
}
run();
