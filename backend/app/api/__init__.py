from fastapi import APIRouter
from app.api import auth, deals, transactions, director, clients, accountant, statistics, senior_manager, references, account_balances, company_balances

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/api")
api_router.include_router(deals.router, prefix="/api")
api_router.include_router(transactions.router, prefix="/api")
api_router.include_router(director.router, prefix="/api")
api_router.include_router(clients.router, prefix="/api")
api_router.include_router(accountant.router, prefix="/api")
api_router.include_router(statistics.router, prefix="/api")
api_router.include_router(senior_manager.router, prefix="/api")
api_router.include_router(references.router, prefix="/api")
api_router.include_router(account_balances.router, prefix="/api")
api_router.include_router(company_balances.router, prefix="/api")

