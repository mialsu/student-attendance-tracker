"""Custom exceptions for the application."""

from fastapi import HTTPException, status


class NotFoundException(HTTPException):
    """Raised when a resource is not found."""

    def __init__(self, detail: str = "Resource not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class UnauthorizedException(HTTPException):
    """Raised when authentication fails."""

    def __init__(self, detail: str = "Could not validate credentials"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenException(HTTPException):
    """Raised when user doesn't have permission."""

    def __init__(self, detail: str = "Permission denied"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class ConflictException(HTTPException):
    """Raised when there's a conflict (e.g., duplicate email)."""

    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class BadRequestException(HTTPException):
    """Raised for invalid requests.

    `rule` and `reason` label *why* a request was refused, for the denial line
    `app/api/handlers.py` emits. Both are **opt-in**: a refusal that sets neither is not logged.

    That is a decision, not an omission. This exception is raised at fourteen sites in `app/`,
    and two of them build their message by interpolating a Student's name -- a duplicate-name
    refusal says which name. A handler that logged every `BadRequestException`, or that logged
    `detail`, would put that name on a line and break ADR-0007 while every test stayed green.
    Labelling at the raise site inverts that: the refusals that stay silent are silent by
    construction, and adding a new one cannot leak a name by forgetting something.

    `reason` is the specific branch (`code_expired`); `rule` is the invariant it belongs to
    (`INV-6`), omitted when no invariant governs the refusal -- a mistyped code breaks no rule,
    so grepping `rule` counts real violations and nothing else.
    """

    def __init__(
        self,
        detail: str = "Bad request",
        *,
        rule: str | None = None,
        reason: str | None = None,
    ):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
        # Keyword-only above, so none of the existing positional call sites can pass a label by
        # accident, and a labelled raise reads as one at a glance.
        self.rule = rule
        self.reason = reason


class UnprocessableEntityException(HTTPException):
    """Raised when a request parses but asks for something incoherent.

    Distinct from `BadRequestException` by status code alone: 422 is what FastAPI already
    returns when a query parameter fails validation, and a range whose end precedes its start
    is the same kind of fault one field cannot see. Keeping it 422 means a client handles one
    status for "your parameters do not make sense" rather than two (spec 0008, decision 8).
    """

    def __init__(self, detail: str = "Unprocessable request"):
        # The literal, not `status.HTTP_422_UNPROCESSABLE_*`, and deliberately the one place in
        # this file that departs from its siblings. Starlette renamed the constant: `_ENTITY` is
        # deprecated and warns, `_CONTENT` exists only from 0.47. `requirements.txt` pins nothing
        # and the newest FastAPI declares `starlette>=0.46.0`, so both names are reachable in the
        # image that deploys and either spelling is an import-time AttributeError waiting for a
        # resolution nobody watched. 422 is not going to change.
        super().__init__(status_code=422, detail=detail)


# Convenience aliases
AuthenticationError = UnauthorizedException
NotFoundError = NotFoundException
DuplicateError = ConflictException
