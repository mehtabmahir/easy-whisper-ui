#include "filequeue.h"

FileQueue::FileQueue() {}

void FileQueue::setProcessor(std::function<void(const QString&)> processor) {
    processFunc = processor;
}

void FileQueue::enqueueFilesAndStart(const QStringList &files) {
    for (const QString &file : files)
        if (!file.isEmpty())
            queue.enqueue(file);
    if (!processing)
        startNext();
}

void FileQueue::startNext() {
    if (queue.isEmpty()) {
        processing = false;
        return;
    }
    processing = true;
    if (processFunc)
        processFunc(queue.dequeue());
}

void FileQueue::clear() {
    queue.clear();
    processing = false;
}
