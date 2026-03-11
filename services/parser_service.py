import os
import io
import pdfplumber
import docx

def extract_text_from_file(file_path, original_filename):
    """
    Extracts text from a given PDF or DOCX file.
    """
    ext = os.path.splitext(original_filename)[1].lower()
    text = ""
    
    try:
        if ext == '.pdf':
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
        elif ext == '.docx':
            doc = docx.Document(file_path)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        else:
            # Unsupported extension
            return None, ext
            
        return text.strip(), ext
    except Exception as e:
        print(f"Error extracting text from {original_filename}: {e}")
        return None, ext
