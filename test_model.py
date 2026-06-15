import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
genai.configure(api_key=api_key)

try:
    model = genai.GenerativeModel("gemini-2.1-flash")
    response = model.generate_content("Hello")
    print(f"Success for gemini-2.1-flash: {response.text}")
except Exception as e:
    print(f"Error for gemini-2.1-flash: {e}")

try:
    model = genai.GenerativeModel("gemini-3-flash-preview")
    response = model.generate_content("Hello")
    print(f"Success for gemini-3-flash-preview: {response.text}")
except Exception as e:
    print(f"Error for gemini-3-flash-preview: {e}")
