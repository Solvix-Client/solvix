export async function parseResponse(
    response: Response,
    responseType: string | undefined,
    transform?: (response: Response) => Promise<any>
) {

    if (transform) {
        return transform(response);
    }

    if (!responseType || responseType === "json") {
        return response.json();
    }

    if (responseType === "text") {
        return response.text();
    }

    if (responseType === "blob") {
        return response.blob();
    }

    if (responseType === "arrayBuffer") {
        return response.arrayBuffer();
    }

    if (responseType === "formData") {
        return response.formData();
    }

    if (responseType === "raw") {
        return response;
    }

    if (responseType === "stream") {
        return response.body;
    }

    return response.json();
}