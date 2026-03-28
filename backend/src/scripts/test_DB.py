import chromadb
import os
from pathlib import Path

# Cấu hình đường dẫn (Đảm bảo khớp với project của bạn)
BACKEND_DIR = Path(__file__).resolve().parents[0] # Chỉnh lại nếu file này nằm ở thư mục khác
DB_PATH = os.path.join(BACKEND_DIR, "rag", "chroma_db")
COLLECTION_NAME = "video_script_rag"

def check_video_exists(target_id):
    if not os.path.exists(DB_PATH):
        print(f"❌ Thư mục Database không tồn tại tại: {DB_PATH}")
        return

    # Kết nối tới ChromaDB
    client = chromadb.PersistentClient(path=DB_PATH)
    
    try:
        # Lấy collection
        collection = client.get_collection(name=COLLECTION_NAME)
        
        # Truy vấn các bản ghi có video_id khớp
        results = collection.get(
            where={"video_id": target_id},
            include=["metadatas"]
        )
        
        count = len(results['ids'])
        
        if count > 0:
            print(f"✅ Tìm thấy video_id: {target_id}")
            print(f"   - Số lượng chunks (đoạn cắt): {count}")
            # In thử metadata của chunk đầu tiên để kiểm tra
            print(f"   - Ví dụ Metadata: {results['metadatas'][0]}")
        else:
            print(f"❓ Không tìm thấy video_id: {target_id} trong Database.")
            
    except Exception as e:
        print(f"❌ Lỗi khi truy vấn: {e}")

if __name__ == "__main__":
    VIDEO_ID = "69c7704b8cea08bc2257a7bf"
    check_video_exists(VIDEO_ID)