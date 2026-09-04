from app.services.support import can_change_status, is_active, new_public_id


def test_public_id_format():
    assert new_public_id().startswith("KS-T-")


def test_active_statuses():
    assert is_active("open")
    assert is_active("in_progress")
    assert is_active("waiting_user")
    assert not is_active("closed")


def test_status_rules():
    assert can_change_status("open", "closed", False)
    assert not can_change_status("open", "resolved", False)
    assert can_change_status("open", "resolved", True)
    assert not can_change_status("closed", "open", True)
