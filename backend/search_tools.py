"""Property information search tools using DuckDuckGo."""

from duckduckgo_search import DDGS


def search_property_info(property_name: str, location: str = "") -> list[dict]:
    """
    Search for property information online.
    
    Args:
        property_name: Name of the property (e.g., "○○マンション")
        location: Optional location hint (e.g., "新宿区")
    
    Returns:
        List of search results with title, url, and body
    """
    query = property_name
    if location:
        query = f"{property_name} {location}"
    
    # Add Japanese real estate keywords
    query += " 物件 情報"
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            return [
                {"title": r.get("title", ""), "url": r.get("href", ""), "body": r.get("body", "")}
                for r in results
            ]
    except Exception as e:
        print(f"[search] Error: {e}")
        return []


def search_property_reviews(property_name: str, location: str = "") -> list[dict]:
    """
    Search for property reviews and口碑.
    
    Returns:
        List of review-related search results
    """
    query = f"{property_name} 口コミ 評判"
    if location:
        query = f"{property_name} {location} 口コミ"
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=3))
            return [
                {"title": r.get("title", ""), "url": r.get("href", ""), "body": r.get("body", "")}
                for r in results
            ]
    except Exception as e:
        print(f"[search] Error: {e}")
        return []


def search_area_info(location: str) -> list[dict]:
    """
    Search for area information (nearby facilities, transport, etc.).
    
    Returns:
        List of area-related search results
    """
    query = f"{location} 駅 超市 学校 周辺環境"
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            return [
                {"title": r.get("title", ""), "url": r.get("href", ""), "body": r.get("body", "")}
                for r in results
            ]
    except Exception as e:
        print(f"[search] Error: {e}")
        return []
