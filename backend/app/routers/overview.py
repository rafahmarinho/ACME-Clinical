from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentUser, get_current_user
from app.repositories import wards as wards_repo
from app.services import overview as overview_service
from app.services import search as search_service

router = APIRouter(tags=["overview"])


@router.get("/overview")
def ward_overview(user: CurrentUser = Depends(get_current_user)):
    return overview_service.ward_overview(user)


@router.get("/monitoring/live")
def live(user: CurrentUser = Depends(get_current_user)):
    return overview_service.live_monitors(user)


@router.get("/wards")
def wards(user: CurrentUser = Depends(get_current_user)):
    return wards_repo.list_wards()


@router.get("/search")
def search(q: str = Query(min_length=1, max_length=80), user: CurrentUser = Depends(get_current_user)):
    return search_service.global_search(q, user)
