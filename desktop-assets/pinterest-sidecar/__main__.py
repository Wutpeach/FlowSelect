import sys

from runtime import SidecarError, main


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SidecarError as exc:
        print(str(exc), file=sys.stderr, flush=True)
        raise SystemExit(exc.exit_code)
