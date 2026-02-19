const fetchWrapper = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  try {
    const response = await fetch(...args);

    // if backend sent a redirect
    if (response.redirected) {
      window.location.href = response.url;
      return response;
    }

    // For API calls (JSON endpoints), always return the response
    // so the caller can handle errors properly
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url ?? '';
    const isApiCall = url.includes('/api/');

    if (isApiCall) {
      // Always return the response for API calls - let the caller handle errors
      return response;
    }

    if (response.status == 404) {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/html")) {
        const html = await response.text();

        // Replace entire current page with returned HTML
        document.open();
        document.write(html);
        document.close();

        return response;
      }
    }

    return response;
  } catch (error) {
    // For network failures, throw so the caller can handle it
    throw error;
  }
};

export default fetchWrapper;
