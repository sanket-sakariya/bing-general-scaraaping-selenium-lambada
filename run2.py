from selenium import webdriver
from selenium.webdriver.common.keys import Keys
import json
import time
import requests
import random
import boto3
import os
import yaml
from selenium.webdriver.common.by import By
from loguru import logger
from twocaptcha import TwoCaptcha
from dotenv import load_dotenv
from tempfile import mkdtemp
from flask import Flask, request, jsonify


load_dotenv()

app = Flask(__name__)
PLATFORM = os.getenv("platform", "DEPLOY")

# Default config file path - users don't need to specify this
DEFAULT_CONFIG_PATH = 'config.yaml'


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


def load_yaml_config(config_path=DEFAULT_CONFIG_PATH):
    """Load YAML configuration file from backend"""
    try:
        with open(config_path, 'r', encoding='utf-8') as file:
            config = yaml.safe_load(file)
        logger.debug(f"Successfully loaded YAML config from {config_path}")
        return config
    except FileNotFoundError:
        logger.error(f"Config file {config_path} not found in backend")
        raise
    except yaml.YAMLError as e:
        logger.error(f"Error parsing YAML config: {e}")
        raise


def bing_search(queries, cc, qft, batch_id=None, search_type="news"):
    """
    Perform Bing news search using backend configuration
    Users only need to provide queries, cc, qft, and batch_id
    """
    # Load YAML configuration from backend (users don't specify config_path)
    try:
        config = load_yaml_config()
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        return {
            'success': False,
            'error': f'Configuration error: {str(e)}',
            'batch_id': batch_id
        }

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

    # Choose JS and config section
    if search_type == "images":
        js_file = 'img-yaml.js'
        config_section = { "bing_images": config.get("bing_images", {}), "processing": config.get("processing", {}), "error_handling": config.get("error_handling", {}) }
        url = "https://www.bing.com/search?q=botxbyte+company+in+rajkot"
    elif search_type == "web":
        js_file = 'web-yaml.js'
        config_section = { "bing_web": config.get("bing_web", {}), "processing": config.get("processing", {}), "error_handling": config.get("error_handling", {}) }
        url = "https://www.bing.com/search?q=botxbyte+company+in+rajkot"
    else:
        js_file = 'news-yaml.js'
        config_section = { "bing_news": config.get("bing_news", {}), "processing": config.get("processing", {}), "error_handling": config.get("error_handling", {}) }
        url = "https://www.bing.com/search?q=botxbyte+company+in+rajkot"

    driver.get(url)

    try:
        with open(js_file, 'r', encoding="utf-8") as file:
            js_code = file.read()
    except FileNotFoundError:
        logger.error(f"{js_file} file not found")
        driver.quit()
        return {
            'success': False,
            'error': f'{js_file} file not found',
            'batch_id': batch_id
        }

    # Log batch processing information
    logger.debug(f"Processing batch_id: {batch_id}")
    
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


    # Check and solve - CAPTCHA
    try:
        driver.find_element(by=By.CSS_SELECTOR, value="div#recaptcha")
        TwoCaptchaGJ.solve_captcha(driver)
    except:
        pass
    time.sleep(5)

    logger.debug(f"Page title: {driver.title}")

    # Convert Python config to JSON for JavaScript
    config_json = json.dumps(config_section)
    all_results = []
    for i, query_obj in enumerate(queries):
        query_string = query_obj['query'] if isinstance(query_obj, dict) and 'query' in query_obj else str(query_obj)
        query_id = query_obj.get('query_id') if isinstance(query_obj, dict) else None
        driver.execute_script("window.fetchResults = null;")
        if search_type == "images":
            driver.execute_script(f"""
            const config = {config_json};
            {js_code}
            fetchImagesWithConfig([arguments[0]], arguments[1], config).then(results => {{
                window.fetchResults = results[0];
            }}).catch(error => {{
                window.fetchResults = {{ success: false, error: error.message, query: arguments[0].query || arguments[0] }};
            }});
            """, query_obj, cc)
        elif search_type == "web":
            driver.execute_script(f"""
            const config = {config_json};
            {js_code}
            fetchWebWithConfig([arguments[0]], arguments[1], config).then(results => {{
                window.fetchResults = results[0];
            }}).catch(error => {{
                window.fetchResults = {{ success: false, error: error.message, query: arguments[0].query || arguments[0] }};
            }});
            """, query_obj, cc)
        else:
            driver.execute_script(f"""
            const config = {config_json};
            {js_code}
            fetchSearchesWithConfig([arguments[0]], arguments[1], arguments[2], config).then(results => {{
                window.fetchResults = results[0];
            }}).catch(error => {{
                window.fetchResults = {{ success: false, error: error.message, query: arguments[0].query || arguments[0] }};
            }});
            """, query_obj, cc, qft)

        # Wait until the results are fetched
        max_wait_time = 60
        for j in range(max_wait_time):
            fetch_results = driver.execute_script("return window.fetchResults;")
            if fetch_results is not None:
                break
            time.sleep(1)
        
        # Handle timeout
        if fetch_results is None:
            logger.error(f"Timeout waiting for results for query: {query_string}")
            fetch_results = {
                'success': False,
                'error': 'Timeout waiting for results',
                'query': query_string,
                'batch_id': batch_id,
                'query_id': query_id
            }
        
        # Log the fetched results
        logger.debug(f"Results for query {i+1}: {fetch_results}")
        
        # Create result structure for this query
        if fetch_results and isinstance(fetch_results, dict):
            # Add batch_id and query_id to the results
            fetch_results['batch_id'] = batch_id
            fetch_results['query_id'] = query_id
            
            # Ensure we have the required fields
            if 'query' not in fetch_results:
                fetch_results['query'] = query_string
        else:
            # If no results or invalid format, create error structure
            fetch_results = {
                'batch_id': batch_id,
                'query_id': query_id,
                'success': False,
                'title': f"{query_string} - Search News",
                'query': query_string,
                'news_results': [],
                'error': 'Invalid or no results returned'
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

    # Parse request body - users no longer need to provide config_path
    request_data = json.loads(event['body'])
    queries = request_data.get("queries", [])
    cc = request_data.get("cc", "US")
    qft = request_data.get("qft", "")
    batch_id = request_data.get("batch_id")
    search_type = request_data.get("search_type", "news")
    
    if not queries or not isinstance(queries, list):
        return {
            'statusCode': 400,
            'body': json.dumps('Error: queries parameter is missing or not a list.')
        }

    logger.debug("Queries: {}, CC: {}, QFT: {}", queries, cc, qft)
    logger.debug("Batch ID: {}", batch_id)
    logger.debug("Search Type: {}", search_type)
    
    # Call bing_news_search without config_path parameter
    results = bing_search(queries, cc, qft, batch_id, search_type)
    return {
        'statusCode': 200,
        'body': json.dumps(results)
    }


@app.route('/', methods=['POST'])
def search_endpoint():
    data = request.json
    queries = data.get('queries', [])
    cc = data.get('cc', 'US')
    qft = data.get('qft', 'interval="3"')
    batch_id = data.get('batch_id')
    search_type = data.get('search_type', '')
    results = bing_search(queries, cc, qft, batch_id, search_type)
    return jsonify(results)


if __name__ == '__main__':
    if PLATFORM == "LOCAL":
        app.run(host='0.0.0.0', port=5000, debug=True)