from selenium import webdriver
from selenium.webdriver.common.keys import Keys
import json
import time
import requests
import random
import boto3
import os
from selenium.webdriver.common.by import By
from loguru import logger
from twocaptcha import TwoCaptcha
from dotenv import load_dotenv
from tempfile import mkdtemp
from flask import Flask, request, jsonify


load_dotenv()

app = Flask(__name__)
PLATFORM = os.getenv("platform", "DEPLOY")


class TwoCaptchaGJ:

    @staticmethod
    def twocaptcha_solver(site_key, data_s, url):
        try:
            logger.debug(f"Starting 2captcha solver - {os.getenv('TWOCAPTCHA_API_KEY')}")
            initial_time = time.time()
            solver = TwoCaptcha(os.getenv("TWOCAPTCHA_API_KEY"))  # Replace with your 2captcha API key
            
            # Start the captcha solving process
            captcha_data = solver.recaptcha(
                sitekey=site_key,
                url=url,
                datas=data_s,
                version='v2',
                action='verify',
                score=0.9
            )
            captcha_id = captcha_data['captchaId']
            logger.debug(f"Captcha solving process started with ID: {captcha_id}")
            
            # Poll for the result
            max_attempts = 30
            attempt = 0
            while attempt < max_attempts:
                try:
                    result = solver.get_result(captcha_id)
                    if result:
                        total_time = time.time() - initial_time
                        logger.debug(f"Captcha solved in {total_time:.2f} seconds")
                        return result
                except Exception as e:
                    if "CAPTCHA_NOT_READY" in str(e):
                        logger.debug(f"Captcha solving attempt {attempt + 1} not ready, retrying...")
                    else:
                        logger.error(f"Error getting captcha result: {e}")
                        return None
                
                attempt += 1
                time.sleep(5)  # Wait 5 seconds before checking again
            
            logger.error("Failed to solve captcha after maximum attempts")
            return None
        except Exception as ex:
            logger.error(f"Error in 2captcha solver: {ex}")
            return None

    @staticmethod
    def solve_captcha(driver):
        try:
            try:
                recaptcha_div = driver.find_element(by=By.CSS_SELECTOR, value="div#recaptcha")
                site_key = recaptcha_div.get_attribute("data-sitekey")
                data_s = recaptcha_div.get_attribute("data-s")
                captcha_response_code = TwoCaptchaGJ.twocaptcha_solver(site_key, data_s, driver.current_url)
                logger.debug(captcha_response_code)

                google_captcha_response_input = driver.find_element(By.ID, 'g-recaptcha-response')
                driver.execute_script(
                    "arguments[0].setAttribute('style','type: text; visibility:visible;');",
                    google_captcha_response_input)
                google_captcha_response_input.send_keys(captcha_response_code.strip())
                driver.execute_script(
                    "arguments[0].setAttribute('style', 'display:none;');",
                    google_captcha_response_input)
                driver.execute_script("submitCallback()")
            except Exception as ex:
                logger.error(ex)
                logger.debug("Captcha is not present.")

            if "Our systems have detected" in driver.page_source:
                logger.error("Captcha failed.")
        except Exception as ex:
            logger.error(ex)

def get_js_file_path(search_type):
    """
    Determine which JavaScript file to use based on search_type
    """
    script_mapping = {
        'image': 'img_scripts.js',
        'img': 'img_scripts.js',
        'images': 'img_scripts.js',
        'web': 'web_scripts.js',
        'website': 'web_scripts.js',
        'news': 'news_scripts.js',
        'article': 'news_scripts.js',
        'articles': 'news_scripts.js'
    }
    
    # Default to img_scripts.js if search_type is not recognized
    default_script = 'img_scripts.js'
    
    # Normalize search_type to lowercase for comparison
    normalized_search_type = search_type.lower() if search_type else ''
    
    return script_mapping.get(normalized_search_type, default_script)

def load_js_script(search_type):
    """
    Load the appropriate JavaScript file based on search_type
    """
    js_file_path = get_js_file_path(search_type)
    
    try:
        with open(js_file_path, 'r', encoding="utf-8") as file:
            js_code = file.read()
        logger.debug(f"Loaded JavaScript file: {js_file_path}")
        return js_code
    except FileNotFoundError:
        logger.error(f"JavaScript file not found: {js_file_path}")
        # Fallback to img_scripts.js
        try:
            with open('img_scripts.js', 'r', encoding="utf-8") as file:
                js_code = file.read()
            logger.debug("Loaded fallback JavaScript file: img_scripts.js")
            return js_code
        except FileNotFoundError:
            logger.error("Fallback JavaScript file (img_scripts.js) not found")
            return ""
    except Exception as ex:
        logger.error(f"Error loading JavaScript file {js_file_path}: {ex}")
        return ""

def bing_search(queries, cc, batch_id=None, search_type=None, qft=None):
    # Set up the webdriver (make sure you have the appropriate driver installed)
    if PLATFORM == "LOCAL":
        options = webdriver.ChromeOptions()
        service = webdriver.ChromeService("C:/Users/i/Downloads/chromedriver-win64/chromedriver.exe")
    else:
        options = webdriver.ChromeOptions()
        service = webdriver.ChromeService("/opt/chromedriver")

        options.binary_location = '/opt/chrome/chrome'
        options.add_argument("--headless=new")
        options.add_argument('--no-sandbox')
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1280x1696")
        options.add_argument("--single-process")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-dev-tools")
        options.add_argument("--no-zygote")
        options.add_argument(f"--user-data-dir={mkdtemp()}")
        options.add_argument(f"--data-path={mkdtemp()}")
        options.add_argument(f"--disk-cache-dir={mkdtemp()}")
        options.add_argument("--remote-debugging-port=9222")

    driver = webdriver.Chrome(options=options, service=service)

    # Log batch processing information
    logger.debug(f"Processing batch_id: {batch_id}")
    logger.debug(f"Search type: {search_type}")
    logger.debug(f"QFT parameter: {qft}")
    
    # Process queries structure
    if isinstance(queries, list) and len(queries) > 0:
        # Check if queries are objects with query_id
        if isinstance(queries[0], dict) and 'query' in queries[0] and 'query_id' in queries[0]:
            # Extract query strings and query_ids
            query_strings = [q['query'] for q in queries]
            query_ids = [q['query_id'] for q in queries]
            logger.debug(f"Processing queries with query_ids: {query_ids}")
        else:
            # Legacy format - queries are just strings
            query_strings = queries
            query_ids = [None] * len(queries)
            logger.debug("Processing queries in legacy format")
    else:
        query_strings = []
        query_ids = []
    
    # Open Bing
    driver.get(f"https://www.bing.com/search?q=botxbyte+company+in+rajkot")

    # Load the appropriate JavaScript file based on search_type
    js_code = load_js_script(search_type)
    
    if not js_code:
        logger.error("No JavaScript code loaded, terminating search")
        driver.quit()
        return {
            'batch_id': batch_id,
            'success': False,
            'error': 'Failed to load JavaScript file',
            'image_results': []
        }

    # Check and solve - CAPTCHA
    try:
        driver.find_element(by=By.CSS_SELECTOR, value="div#recaptcha")
        TwoCaptchaGJ.solve_captcha(driver)
    except:
        pass
    time.sleep(5)

    logger.debug(f"Page title: {driver.title}")

    # Process each query individually
    all_results = []
    
    # Use the original queries list directly (each item is a dict with 'query' and 'query_id')
    for i, query_obj in enumerate(queries):
        query_string = query_obj['query'] if isinstance(query_obj, dict) and 'query' in query_obj else str(query_obj)
        query_id = query_obj.get('query_id') if isinstance(query_obj, dict) else None
        logger.debug(f"Processing query {i+1}: {query_string} with query_id: {query_id}")

        # Clear previous results
        driver.execute_script("window.fetchResults = null;")

        # Determine if this is a news search to decide parameters
        is_news_search = search_type and search_type.lower() in ['news', 'article', 'articles']
        
        if is_news_search:
            # For news search, pass query, cc, and qft parameters
            driver.execute_script(js_code + """
            fetchSearches([arguments[0]], arguments[1], arguments[2]).then(results => {
                window.fetchResults = results[0];
            });
            """, query_string, cc, qft or "")
        else:
            # For other searches (image, web), pass query and cc parameters
            driver.execute_script(js_code + """
            fetchSearches([arguments[0]], arguments[1]).then(results => {
                window.fetchResults = results[0];
            });
            """, query_string, cc)

        # Wait until the results are fetched
        for j in range(60):
            fetch_results = driver.execute_script("return window.fetchResults;")
            if fetch_results is not None:
                break
            time.sleep(1)
        
        # Log the fetched results
        logger.debug(f"Results for query {i+1}: {fetch_results}")
        
        # Create result structure for this query based on search_type
        if fetch_results:
            if isinstance(fetch_results, dict):
                # If it's already a dict, add batch_id and query_id
                fetch_results['batch_id'] = batch_id
                fetch_results['query_id'] = query_id
            elif isinstance(fetch_results, list):
                # If results is a list, create the expected response format
                # Determine the result key based on search_type
                result_key = get_result_key(search_type)
                fetch_results = {
                    'batch_id': batch_id,
                    'query_id': query_id,
                    'success': True,
                    'title': f"{query_string} - Search {search_type or 'image'}",
                    'query': query_string,
                    result_key: fetch_results
                }
            else:
                # If results is not a list or dict, wrap it
                result_key = get_result_key(search_type)
                fetch_results = {
                    'batch_id': batch_id,
                    'query_id': query_id,
                    'success': True,
                    'title': f"{query_string} - Search {search_type or 'image'}",
                    'query': query_string,
                    result_key: [fetch_results] if fetch_results else []
                }
        else:
            # If no results, return empty structure
            result_key = get_result_key(search_type)
            fetch_results = {
                'batch_id': batch_id,
                'query_id': query_id,
                'success': False,
                'title': f"{query_string} - Search {search_type or 'image'}",
                'query': query_string,
                result_key: []
            }
        
        all_results.append(fetch_results)

    logger.debug("Exit")
    # Close the browser
    driver.quit()
    
    # Return all results
    if len(all_results) == 1:
        return all_results[0]  # Return single result directly
    else:
        return all_results  # Return array of results for multiple queries

def get_result_key(search_type):
    """
    Determine the result key based on search_type
    """
    if not search_type:
        return 'image_results'
    
    search_type_lower = search_type.lower()
    
    if search_type_lower in ['image', 'img', 'images']:
        return 'image_results'
    elif search_type_lower in ['web', 'website']:
        return 'web_results'
    elif search_type_lower in ['news', 'article', 'articles']:
        return 'news_results'
    else:
        return 'image_results'  # default

def lambda_handler(event=None, context=None):
    function_name = os.getenv('AWS_LAMBDA_FUNCTION_NAME', context.function_name)
    default_region = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    access_key_id = os.getenv('MY_AWS_ACCESS_KEY_ID')
    secret_access_key = os.getenv('MY_AWS_SECRET_ACCESS_KEY')

    if not access_key_id or not secret_access_key:
        return {
            'statusCode': 500,
            'body': json.dumps('Error: AWS credentials are not set.')
        }

    try:
        # Create a boto3 client
        client = boto3.client(
            'lambda',
            region_name=default_region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )

        input_params = {
            'FunctionName': function_name,
            'Environment': {
                'Variables': {
                    'MY_AWS_ACCESS_KEY_ID': access_key_id,
                    'MY_AWS_SECRET_ACCESS_KEY': secret_access_key,
                    'ENV_VARIABLE': str(random.random()),
                    'TWOCAPTCHA_API_KEY': os.getenv('TWOCAPTCHA_API_KEY')
                }
            }
        }
        response = client.update_function_configuration(**input_params)
    except Exception as ex:
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error updating environment variables: {str(ex)}')
        }

    
    queries = json.loads(event['body']).get("queries", [])
    cc = json.loads(event['body']).get("cc", "US")
    batch_id = json.loads(event['body']).get("batch_id")
    search_type = json.loads(event['body']).get("search_type", "image")  # Added search_type extraction
    qft = json.loads(event['body']).get("qft", None)  # Added qft parameter for news search
    
    if not queries or not isinstance(queries, list):
        return {
            'statusCode': 400,
            'body': json.dumps('Error: queries parameter is missing or not a list.')
        }

    logger.debug("Queries: {}, CC: {}, Search Type: {}, QFT: {}", queries, cc, search_type, qft)
    logger.debug("Batch ID: {}", batch_id)
    
    results = bing_search(queries, cc, batch_id, search_type, qft)
    return {
        'statusCode': 200,
        'body': json.dumps(results)
    }


@app.route('/', methods=['POST'])
def search_endpoint():
    data = request.json
    queries = data.get('queries', [])
    cc = data.get('cc', 'US')
    batch_id = data.get('batch_id')
    search_type = data.get('search_type', 'image')  # Added search_type extraction
    qft = data.get('qft', None)  # Added qft parameter for news search
    
    results = bing_search(queries, cc, batch_id, search_type, qft)
    return jsonify(results)

if __name__ == '__main__':
    if PLATFORM == "LOCAL":
        app.run(host='0.0.0.0', port=5000, debug=True)