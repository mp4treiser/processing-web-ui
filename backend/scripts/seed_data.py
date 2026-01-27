"""
Скрипт для заполнения БД тестовыми данными
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.client import Client


def seed_data():
    db: Session = SessionLocal()
    
    try:
        # Создаем пользователей
        users_data = [
            {
                "email": "manager@test.com",
                "password": "manager123",
                "full_name": "Менеджер Тестовый",
                "role": UserRole.MANAGER
            },
            {
                "email": "accountant@test.com",
                "password": "accountant123",
                "full_name": "Бухгалтер Тестовый",
                "role": UserRole.ACCOUNTANT
            },
            {
                "email": "director@test.com",
                "password": "director123",
                "full_name": "ФинДиректор Тестовый",
                "role": UserRole.DIRECTOR
            },
            {
                "email": "senior@test.com",
                "password": "senior123",
                "full_name": "Старший Менеджер Тестовый",
                "role": UserRole.SENIOR_MANAGER
            }
        ]
        
        for user_data in users_data:
            existing = db.query(User).filter(User.email == user_data["email"]).first()
            if not existing:
                user = User(
                    email=user_data["email"],
                    hashed_password=get_password_hash(user_data["password"]),
                    full_name=user_data["full_name"],
                    role=user_data["role"],
                    is_active="true"
                )
                db.add(user)
        
        # Создаем клиентов
        clients_data = [
            {"name": "Клиент А", "contact_info": "client_a@example.com"},
            {"name": "Клиент Б", "contact_info": "client_b@example.com"},
        ]
        
        for client_data in clients_data:
            existing = db.query(Client).filter(Client.name == client_data["name"]).first()
            if not existing:
                client = Client(**client_data)
                db.add(client)
        
        db.commit()
        print("✅ Seed data created successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()

