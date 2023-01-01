FROM python:3.8.11-slim-buster
ENV TZ='Asia/Tokyo'
RUN pip install --upgrade pip
RUN pip install flask==2.0.1
WORKDIR /app
COPY . /app
EXPOSE 5000
CMD ["python", "main.py"]