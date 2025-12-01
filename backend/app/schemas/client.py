from pydantic import BaseModel


class ClientBase(BaseModel):
    name: str
    contact_info: str | None = None
    notes: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientResponse(ClientBase):
    id: int

    class Config:
        from_attributes = True

