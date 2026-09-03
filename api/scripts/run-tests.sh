#!/bin/bash
set -e

echo "🧪 Running Tests for Student Attendance Tracker API"
echo ""

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  Virtual environment not activated!"
    echo "Please run: source venv/bin/activate"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Run tests based on argument
case "${1:-all}" in
    "all")
        echo "📋 Running all tests..."
        pytest -v --cov=app --cov-report=term-missing
        ;;
    "fast")
        echo "⚡ Running fast tests only..."
        pytest -v -m "not slow"
        ;;
    "coverage")
        echo "📊 Generating coverage report..."
        pytest --cov=app --cov-report=html
        echo ""
        echo "✅ Coverage report generated!"
        echo "📂 Open: htmlcov/index.html"
        ;;
    "watch")
        echo "👀 Watching for changes..."
        if command -v ptw &> /dev/null; then
            ptw -- -v
        else
            echo "❌ pytest-watch not installed"
            echo "Install with: pip install pytest-watch"
            exit 1
        fi
        ;;
    "auth")
        echo "🔐 Running authentication tests..."
        pytest tests/test_auth.py -v
        ;;
    "classes")
        echo "📚 Running classes tests..."
        pytest tests/test_classes.py -v
        ;;
    "attendance")
        echo "✅ Running attendance tests..."
        pytest tests/test_attendance.py -v
        ;;
    *)
        echo "Usage: $0 [all|fast|coverage|watch|auth|classes|attendance]"
        echo ""
        echo "Examples:"
        echo "  $0 all        - Run all tests with coverage"
        echo "  $0 fast       - Run only fast tests"
        echo "  $0 coverage   - Generate HTML coverage report"
        echo "  $0 watch      - Watch mode (auto-run on changes)"
        echo "  $0 auth       - Run only authentication tests"
        echo "  $0 classes    - Run only classes tests"
        echo "  $0 attendance - Run only attendance tests"
        exit 1
        ;;
esac

echo ""
echo "✅ Tests completed!"

