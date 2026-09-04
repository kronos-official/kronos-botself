from aiogram.fsm.state import State, StatesGroup


class AuthStates(StatesGroup):
    phone = State()
    code = State()
    password = State()


class ScheduleStates(StatesGroup):
    target = State()
    content_type = State()
    text = State()
    interval = State()
